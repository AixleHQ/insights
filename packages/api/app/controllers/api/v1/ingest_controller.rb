# frozen_string_literal: true

module Api
  module V1
    class IngestController < ActionController::API
      before_action :authenticate_by_token!

      # POST /api/v1/ingest/events
      def create
        event_params = permitted_params
        org = @tool_account.organization
        event_params[:organization_id] = org.id
        event_params[:user_id] = @tool_account.user.id
        event_params[:tool_name] = @tool_account.tool_name
        event_params[:event_type] = event_params[:event_type].presence || "other"

        raw_key = store_raw_event(request.raw_post, org)
        workflow_result = start_ingestion_workflow(raw_key, event_params, org)

        render json: {
          data: {
            accepted: true,
            workflowId: workflow_result[:workflow_id],
            rawEventKey: raw_key
          }
        }, status: :accepted
      rescue StandardError => e
        Rails.logger.error "[Ingest] Failed: #{e.message}"
        render json: { error: "Processing failed", message: e.message }, status: :unprocessable_entity
      end

      private

      def authenticate_by_token!
        auth_header = request.headers["Authorization"]
        raw = auth_header&.start_with?("Bearer ") ? auth_header.delete_prefix("Bearer ").strip : nil
        @tool_account = raw.present? ? UserToolAccount.find_by_ingest_token(raw) : nil

        unless @tool_account&.is_active? && @tool_account.organization.present?
          render json: { error: "Unauthorized" }, status: :unauthorized
        end
      end

      def store_raw_event(raw_payload, org)
        RawEventStore.store(
          raw_payload,
          organization_id: org.id,
          metadata: { content_type: request.content_type }
        )
      end

      def start_ingestion_workflow(raw_key, event_params, org)
        workflow_id = "ingest-#{org.id}-#{SecureRandom.uuid}"

        Temporal::Client.start_workflow(
          "Workflows::IngestionSanitizationWorkflow",
          workflow_id: workflow_id,
          args: {
            raw_event_key: raw_key,
            raw_event_bucket: ENV.fetch("MINIO_BUCKET", "db90-raw-events"),
            event: event_params.merge(
              organization_id: org.id,
              occurred_at: event_params[:occurred_at] || Time.current.iso8601
            )
          }
        )

        { workflow_id: workflow_id }
      rescue StandardError => e
        Rails.logger.warn "[Ingest] Temporal workflow failed, falling back to direct insert: #{e.message}"
        fallback_direct_insert(event_params, org)
      end

      def fallback_direct_insert(event_params, org)
        event = org.tool_events.create!(
          user_id: event_params[:user_id],
          project_id: event_params[:project_id],
          tool_name: event_params[:tool_name],
          event_type: event_params[:event_type],
          model: event_params[:model],
          tokens_in: event_params[:tokens_in],
          tokens_out: event_params[:tokens_out],
          cost_usd: event_params[:cost_usd],
          duration_ms: event_params[:duration_ms],
          occurred_at: event_params[:occurred_at] || Time.current,
          metadata: event_params[:metadata] || {}
        )

        { workflow_id: nil, tool_event_id: event.id, fallback: true }
      end

      def permitted_params
        params.permit(
          :tool_name, :event_type, :model, :tokens_in, :tokens_out,
          :cost_usd, :duration_ms, :occurred_at, :project_id, :user_id,
          :prompt, :response, :system_prompt,
          messages: [ :role, :content ],
          metadata: {}
        ).to_h.symbolize_keys
      end
    end
  end
end

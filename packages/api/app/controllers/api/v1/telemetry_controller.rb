# frozen_string_literal: true

module Api
  module V1
    class TelemetryController < BaseController
      before_action :require_organization!

      # POST /api/v1/organizations/:organization_id/telemetry/ingest
      def ingest
        authorize! current_organization, to: :create_event?

        event_params = telemetry_params
        event_params[:organization_id] = current_organization.id
        event_params[:user_id] ||= current_user.id

        # Store raw event in MinIO
        raw_key = store_raw_event(request.raw_post)

        # Start Temporal workflow for processing
        workflow_result = start_ingestion_workflow(raw_key, event_params)

        render json: {
          data: {
            accepted: true,
            workflowId: workflow_result[:workflow_id],
            rawEventKey: raw_key
          }
        }, status: :accepted
      rescue StandardError => e
        Rails.logger.error "[Telemetry] Ingest failed: #{e.message}"
        render json: { error: "Processing failed", message: e.message }, status: :unprocessable_content
      end

      # POST /api/v1/organizations/:organization_id/telemetry/batch
      def batch
        authorize! current_organization, to: :create_event?

        events = params[:events] || []
        if events.empty?
          return render json: { error: "Bad Request", message: "No events provided" }, status: :bad_request
        end

        if events.length > max_batch_size
          return render json: {
            error: "Bad Request",
            message: "Batch size exceeds maximum of #{max_batch_size}"
          }, status: :bad_request
        end

        results = events.map.with_index do |event, idx|
          process_batch_event(event, idx)
        end

        accepted_count = results.count { |r| r[:accepted] }
        failed_count = results.count { |r| !r[:accepted] }

        render json: {
          data: {
            total: events.length,
            accepted: accepted_count,
            failed: failed_count,
            results: results
          }
        }, status: :accepted
      end

      private

      def telemetry_params
        params.permit(
          :tool_name, :event_type, :model, :tokens_in, :tokens_out,
          :cost_usd, :duration_ms, :occurred_at, :project_id, :user_id,
          :prompt, :response, :system_prompt,
          messages: [ :role, :content ],
          metadata: {}
        ).to_h.symbolize_keys
      end

      def store_raw_event(raw_payload)
        RawEventStore.store(
          raw_payload,
          organization_id: current_organization.id,
          metadata: { content_type: request.content_type }
        )
      end

      def start_ingestion_workflow(raw_key, event_params)
        workflow_id = "ingest-#{current_organization.id}-#{SecureRandom.uuid}"

        Temporal::Client.start_workflow(
          "Workflows::IngestionSanitizationWorkflow",
          workflow_id: workflow_id,
          args: {
            raw_event_key: raw_key,
            raw_event_bucket: ENV.fetch("MINIO_BUCKET", "db90-raw-events"),
            event: event_params.merge(
              organization_id: current_organization.id,
              occurred_at: event_params[:occurred_at] || Time.current.iso8601
            )
          }
        )

        { workflow_id: workflow_id }
      rescue StandardError => e
        Rails.logger.warn "[Telemetry] Temporal workflow failed, falling back to direct insert: #{e.message}"
        fallback_direct_insert(event_params)
      end

      def fallback_direct_insert(event_params)
        event = current_organization.tool_events.create!(
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

      def process_batch_event(event, index)
        event_params = event.permit(
          :tool_name, :event_type, :model, :tokens_in, :tokens_out,
          :cost_usd, :duration_ms, :occurred_at, :project_id, :user_id,
          :prompt, :response, :system_prompt,
          messages: [ :role, :content ],
          metadata: {}
        ).to_h.symbolize_keys

        event_params[:organization_id] = current_organization.id
        event_params[:user_id] ||= current_user.id

        raw_key = store_raw_event(event.to_json)
        result = start_ingestion_workflow(raw_key, event_params)

        { index: index, accepted: true, workflow_id: result[:workflow_id] }
      rescue StandardError => e
        { index: index, accepted: false, error: e.message }
      end

      def max_batch_size
        ENV.fetch("TELEMETRY_MAX_BATCH_SIZE", 100).to_i
      end
    end
  end
end

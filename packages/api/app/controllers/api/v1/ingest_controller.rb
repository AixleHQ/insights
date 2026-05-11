# frozen_string_literal: true

module Api
  module V1
    class IngestController < ActionController::API
      include IngestTokenAuthentication
      include IngestRateLimiter

      # POST /api/v1/ingest/events
      def create
        event_params = permitted_params

        # Back-compat: detect raw Claude Code hook payloads (no jq transform applied)
        # and map them to structured fields before processing.
        if event_params[:event_type].blank?
          mapped = extract_claude_code_hook_params
          event_params.merge!(mapped) if mapped.any?
        end

        org = @tool_account.organization
        event_params[:organization_id] = org.id
        event_params[:user_id] = @tool_account.user.id
        event_params[:tool_name] = @tool_account.tool_name
        event_params[:event_type] = event_params[:event_type].presence || "other"

        # Strip project_id that is invalid or inaccessible — attribution is additive,
        # never blocking.
        strip_inaccessible_project_id!(event_params)

        raw_key = store_raw_event(request.raw_post, org)
        workflow_result = start_ingestion_workflow(raw_key, event_params, org)

        data = { accepted: true, rawEventKey: raw_key }
        data[:workflowId] = workflow_result[:workflow_id] if workflow_result[:workflow_id]
        data[:fallback] = true if workflow_result[:fallback]
        render json: { data: data }, status: :accepted
      rescue StandardError => e
        Rails.logger.error "[Ingest] Failed: #{e.message}"
        render json: { error: "Processing failed", message: e.message }, status: :unprocessable_content
      end

      private

      # Validate project_id belongs to the token's org or user's personal projects.
      # Strips silently rather than rejecting — attribution is additive, never blocking.
      def strip_inaccessible_project_id!(event_params)
        pid = event_params[:project_id]
        return unless pid.present?

        if pid !~ /\A[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z/i
          event_params.delete(:project_id)
          Rails.logger.warn("[Ingest] project_id #{pid.inspect} is not a valid UUID — stripped")
          return
        end

        unless accessible_projects.exists?(id: pid)
          event_params.delete(:project_id)
          Rails.logger.warn("[Ingest] project_id #{pid} not accessible — stripped")
        end
      end

      def store_raw_event(raw_payload, org)
        RawEventStore.ensure_bucket_exists!
        RawEventStore.store(
          raw_payload,
          organization_id: org.id,
          metadata: { content_type: request.content_type }
        )
      rescue StandardError => e
        Rails.logger.warn "[Ingest] Raw event storage failed (continuing): #{e.message}"
        nil
      end

      def start_ingestion_workflow(raw_key, event_params, org)
        # NOTE: The Temporal worker that completes this workflow is responsible for
        # broadcasting via EventsChannel after the upsert. The fallback path below
        # handles the broadcast inline when Temporal is unavailable.
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
        attributes = {
          organization_id: org.id,
          user_id: event_params[:user_id],
          project_id: event_params[:project_id],
          tool_name: event_params[:tool_name],
          event_type: event_params[:event_type],
          model: event_params[:model],
          tokens_in: event_params[:tokens_in],
          tokens_out: event_params[:tokens_out],
          tokens_total: event_params[:tokens_total],
          cost_usd: event_params[:cost_usd],
          duration_ms: event_params[:duration_ms],
          occurred_at: event_params[:occurred_at] || Time.current,
          metadata: event_params[:metadata] || {}
        }
        result = ToolEvents::Upsert.call(attributes)
        tool_event = result[:tool_event]

        begin
          EventsChannel.broadcast_new_event(org.id, tool_event)
        rescue StandardError => e
          Rails.logger.warn "[Ingest] ActionCable broadcast failed: #{e.message}"
        end

        { workflow_id: nil, tool_event_id: tool_event.id, fallback: true }
      end

      def permitted_params
        params.permit(
          :tool_name, :event_type, :model, :tokens_in, :tokens_out, :tokens_total,
          :cost_usd, :duration_ms, :occurred_at, :project_id, :user_id,
          metadata: {}
        ).to_h.symbolize_keys
      end

      # Detect and map raw Claude Code hook payloads.
      # Claude Code sends PostToolUse events as:
      #   { session_id, tool_name, tool_input, tool_response }
      # and Stop events as:
      #   { session_id, stop_hook_active, usage?, total_cost_usd? }
      # Neither matches the standard ingest schema, so we map the fields here.
      def extract_claude_code_hook_params
        return {} unless params[:session_id].present?

        if params.key?(:tool_input) && params.key?(:tool_response)
          # PostToolUse: record a tool_use event with session metadata
          {
            event_type: "tool_use",
            metadata: { "session_id" => params[:session_id], "hook_tool" => params[:tool_name] }.compact
          }
        elsif params.key?(:stop_hook_active)
          # Stop: record a chat event and extract usage if Claude Code exposes it
          usage = params[:usage]&.to_unsafe_h || {}
          {
            event_type: "chat",
            tokens_in: usage["input_tokens"],
            tokens_out: usage["output_tokens"],
            cost_usd: params[:total_cost_usd] || params[:total_cost],
            metadata: { "session_id" => params[:session_id] }.compact
          }.compact
        else
          {}
        end
      end
    end
  end
end

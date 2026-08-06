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
          event_params.merge!(extract_claude_code_hook_params)
        end

        org = @tool_account.organization
        event_params[:organization_id] = org.id
        event_params[:user_id] = @tool_account.user.id
        event_params[:tool_name] = @tool_account.tool_name
        event_params[:event_type] = event_params[:event_type].presence || "other"

        # Reject when the user lacks Owner/Member role on a project they can
        # otherwise see; strip project_id that is invalid or from another scope
        # (attribution is additive, never blocking) — see AIX-503.
        enforce_project_contribution!(event_params)

        raw_key = store_raw_event(request.raw_post, org)
        workflow_result = start_ingestion_workflow(raw_key, event_params, org)
        activate_tool_account_if_needed!

        data = { accepted: true, rawEventKey: raw_key }
        data[:workflowId] = workflow_result[:workflow_id] if workflow_result[:workflow_id]
        data[:fallback] = true if workflow_result[:fallback]
        render json: { data: data }, status: :accepted
      rescue ProjectContributionDenied
        render json: { error: "Forbidden", code: "project_role_required" }, status: :forbidden
      rescue ActiveRecord::RecordInvalid => e
        Rails.logger.warn "[Ingest] Validation failed: #{e.message}"
        render json: {
          error: "Unprocessable Entity",
          errors: e.record.errors.to_hash(true).transform_values { |msgs| msgs.map { |m| m.is_a?(Hash) ? m[:message] : m } }
        }, status: :unprocessable_content
      rescue ActionController::ParameterMissing, JSON::ParserError => e
        Rails.logger.warn "[Ingest] Bad request: #{e.message}"
        render json: { error: "Bad Request", message: e.message }, status: :bad_request
      end

      # NOTE: Programming errors (NoMethodError, ArgumentError, NameError, etc.)
      # are intentionally NOT rescued here. They must bubble up to Rails' default
      # 500 handler so error-tracking (Sentry, etc.) can surface them — otherwise
      # bugs are silently masked as 422 responses and ingest clients incorrectly
      # treat them as their own bad input.

      class ProjectContributionDenied < StandardError; end

      private

      # Enforce the project-level contribution rule (AIX-503):
      #   - malformed / cross-scope / unknown project_id → stripped (additive attribution)
      #   - project the user CAN reach but only as a Viewer → reject (403)
      #   - project where the user is Owner/Member → passes through
      def enforce_project_contribution!(event_params)
        pid = event_params[:project_id]
        return unless pid.present?

        if pid !~ /\A[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z/i
          event_params.delete(:project_id)
          Rails.logger.warn("[Ingest] project_id #{pid.inspect} is not a valid UUID — stripped")
          return
        end

        project = accessible_projects.find_by(id: pid)
        if project.nil?
          event_params.delete(:project_id)
          Rails.logger.warn("[Ingest] project_id #{pid} not accessible — stripped")
          return
        end

        return if can_contribute_to_project?(project)

        Rails.logger.warn("[Ingest] project_id #{pid} rejected — user lacks Owner/Member role")
        raise ProjectContributionDenied
      end

      # Owner/Member contribution rights on a specific project. Personal-project
      # owners always qualify; org owners are implicit contributors to every org
      # project; otherwise an explicit Owner/Member project membership is required.
      def can_contribute_to_project?(project)
        user = @tool_account.user
        return true if project.personal? && project.owner_id == user.id
        return true if project.organization_project? && user.role_in(project.organization) == "owner"

        membership = project.project_memberships.find_by(user_id: user.id)
        membership&.can_edit? || false
      end

      def store_raw_event(raw_payload, org)
        RawEventStore.ensure_bucket_exists!
        RawEventStore.store(
          raw_payload,
          organization_id: org.id,
          metadata: { content_type: request.content_type }
        )
      rescue StandardError => e
        Rails.logger.warn(
          structured_log_line(
            "ingest_raw_storage_failed",
            organization_id: org.id,
            error_class: e.class.name,
            message: e.message
          )
        )
        Rails.error.report(e, context: { component: "ingest", stage: "raw_storage", organization_id: org.id }, handled: true)
        nil
      end

      def start_ingestion_workflow(raw_key, event_params, org)
        # NOTE: The Temporal worker that completes this workflow is responsible for
        # broadcasting via EventsChannel after the upsert. The fallback path below
        # handles the broadcast inline when Temporal is unavailable.
        if raw_key.blank?
          log_fallback!(reason: "raw_key_missing", organization_id: org.id)
          return fallback_direct_insert(event_params, org)
        end

        unless Temporal::Client.workers_polling?
          log_fallback!(reason: "no_workers_polling", organization_id: org.id)
          return fallback_direct_insert(event_params, org)
        end

        workflow_id = "ingest-#{org.id}-#{SecureRandom.uuid}"

        Temporal::Client.start_workflow(
          Temporal::Client::INGESTION_SANITIZATION_WORKFLOW,
          workflow_id: workflow_id,
          args: {
            raw_event_key: raw_key,
            raw_event_bucket: ENV.fetch("RAW_EVENTS_BUCKET", "raw-events"),
            event: event_params.merge(
              organization_id: org.id,
              occurred_at: event_params[:occurred_at] || Time.current.iso8601
            )
          },
          execution_timeout: 300
        )

        { workflow_id: workflow_id }
      rescue StandardError => e
        log_fallback!(
          reason: "temporal_unavailable",
          organization_id: org.id,
          error_class: e.class.name,
          message: e.message
        )
        Rollbar.error(e, component: "ingest", stage: "temporal_start", organization_id: org.id)
        fallback_direct_insert(event_params, org)
      end

      # The direct-insert fallback bypasses the sanitization workflow (classification +
      # PII scrubbing). This is acceptable as a recovery path but MUST be observable so
      # ops can detect prolonged degraded ingest. Every fallback emits a structured
      # WARN log with a stable event key (`ingest_fallback_taken`) plus a Rollbar
      # warning so the on-call team can see fallback volume and trends.
      def log_fallback!(reason:, organization_id:, **extra)
        Rails.logger.warn(
          structured_log_line(
            "ingest_fallback_taken",
            reason: reason,
            organization_id: organization_id,
            **extra
          )
        )
        Rollbar.warning(
          "Ingest fallback taken",
          reason: reason,
          organization_id: organization_id,
          **extra
        )
      end

      def structured_log_line(event, **fields)
        "[Ingest] event=#{event} " + fields.map { |k, v| "#{k}=#{v.inspect}" }.join(" ")
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

      def activate_tool_account_if_needed!
        return unless @tool_account.may_activate_connection?

        @tool_account.activate_connection!
      rescue AASM::InvalidTransition
        # A concurrent ingest request already activated the account — reload to get
        # current state and continue normally; the transition is idempotent.
        @tool_account.reload
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
          usage = params[:usage]&.to_unsafe_h || {}
          metadata = { "session_id" => params[:session_id] }
          cache_read = usage["cache_read_input_tokens"].to_i
          cache_write = usage["cache_creation_input_tokens"].to_i
          metadata["cache_read_tokens"] = cache_read if cache_read > 0
          metadata["cache_write_tokens"] = cache_write if cache_write > 0
          raw_input = usage["input_tokens"].to_i
          base_input = raw_input > 0 ? [ raw_input - cache_read - cache_write, 0 ].max : nil
          {
            event_type: "chat",
            model: params[:model],
            tokens_in: base_input,
            tokens_out: usage["output_tokens"],
            cost_usd: params[:total_cost_usd] || params[:total_cost],
            metadata: metadata.compact
          }.compact
        else
          {}
        end
      end
    end
  end
end

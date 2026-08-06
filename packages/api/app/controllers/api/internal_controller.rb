# frozen_string_literal: true

module Api
  class InternalController < ApplicationController
    skip_before_action :authenticate_user!
    skip_before_action :set_current_organization
    before_action :verify_internal_api_key!

    # POST /api/internal/tool_events
    def create_tool_event
      result = ToolEvents::Upsert.call(tool_event_params.to_h.symbolize_keys)
      render json: {
        data: {
          id: result[:tool_event].id,
          occurred_at: result[:tool_event].occurred_at
        }
      }, status: :created
    rescue ActiveRecord::RecordInvalid => e
      render json: { error: "Validation failed", errors: e.record.errors.to_hash }, status: :unprocessable_content
    end

    # POST /api/internal/audit_logs
    def create_audit_log
      audit_log = AuditLog.create!(audit_log_params)
      render json: { data: { id: audit_log.id } }, status: :created
    rescue ActiveRecord::RecordInvalid => e
      render json: { error: "Validation failed", errors: e.record.errors.to_hash }, status: :unprocessable_content
    end

    # POST /api/internal/alerts
    def create_alert
      alert_data = alert_params

      Rails.logger.info("[InternalAPI] Alert created: #{alert_data[:alert_type]} for org #{alert_data[:organization_id]}")

      # Broadcast via ActionCable
      if alert_data[:organization_id]
        EventsChannel.broadcast_alert(alert_data[:organization_id], alert_data)
      end

      # Deliver to Slack if enabled for this organization
      deliver_slack_alert(alert_data)

      # Deliver to project Slack webhooks where individually enabled
      deliver_project_slack_alerts(alert_data)

      render json: { data: { id: SecureRandom.uuid, status: "sent" } }, status: :created
    end

    # POST /api/internal/event_texts
    def create_event_text
      result = EventTexts::Persist.call(
        tool_event_id: event_text_params[:tool_event_id],
        occurred_at: event_text_params[:occurred_at],
        user_text: event_text_params[:user_text],
        assistant_text: event_text_params[:assistant_text],
        sanitizer_version: event_text_params[:sanitizer_version]
      )

      if result[:captured]
        render json: {
          data: {
            tool_event_id: result[:event_text]&.tool_event_id,
            occurred_at: result[:event_text]&.occurred_at
          }
        }, status: :created
      else
        render json: { captured: false }, status: :ok
      end
    rescue ActiveRecord::RecordInvalid => e
      render json: { error: "Validation failed", errors: e.record.errors.to_hash }, status: :unprocessable_content
    end

    # POST /api/internal/broadcasts
    def create_broadcast
      channel = params.dig(:broadcast, :channel)
      event = params.dig(:broadcast, :event)
      data = params.dig(:broadcast, :data)

      if channel && event && data
        ActionCable.server.broadcast(channel, { type: event, **data.to_unsafe_h })
        render json: { success: true }, status: :ok
      else
        render json: { error: "Missing required parameters" }, status: :bad_request
      end
    end

    # GET /api/internal/organizations/:id/sanitization_policy
    def sanitization_policy
      org = Organization.find(params[:id])
      # SanitizationPolicy is global - get the current active policy
      policy = SanitizationPolicy.current

      if policy
        render json: {
          data: {
            id: policy.id,
            version: policy.version,
            name: policy.name,
            classification_rules: policy.classification_rules,
            sanitization_rules: policy.sanitization_rules
          }
        }
      else
        render json: { data: nil }
      end
    rescue ActiveRecord::RecordNotFound
      render json: { error: "Organization not found" }, status: :not_found
    end

    private

    def verify_internal_api_key!
      api_key = ENV["INTERNAL_API_KEY"]
      return if api_key.blank? # Skip verification if no key configured

      provided_key = extract_bearer_token

      unless provided_key && ActiveSupport::SecurityUtils.secure_compare(provided_key, api_key)
        render json: { error: "Unauthorized" }, status: :unauthorized
      end
    end

    def extract_bearer_token
      auth_header = request.headers["Authorization"]
      return nil unless auth_header&.start_with?("Bearer ")

      auth_header.split(" ").last
    end

    def tool_event_params
      params.require(:tool_event).permit(
        :organization_id, :user_id, :project_id,
        :tool_name, :event_type, :model,
        :tokens_in, :tokens_out, :cost_usd, :duration_ms,
        :occurred_at,
        metadata: {}
      ).tap do |permitted|
        # Ensure metadata is a hash even if deeply nested
        permitted[:metadata] = params[:tool_event][:metadata].to_unsafe_h if params[:tool_event][:metadata].present?
      end
    end

    def audit_log_params
      params.require(:audit_log).permit(
        :tool_event_id, :organization_id, :policy_version_id,
        :raw_event_key, :risk_level, :temporal_workflow_id,
        :confidence_score,
        classification_labels: [], sanitization_actions: [], metadata: {}
      )
    end

    def event_text_params
      params.require(:event_text).permit(
        :tool_event_id, :occurred_at, :user_text, :assistant_text, :sanitizer_version
      )
    end

    def alert_params
      params.require(:alert).permit(
        :organization_id, :project_id, :alert_type, :severity,
        :title, :message, metadata: {}
      ).to_h.symbolize_keys
    end

    def deliver_slack_alert(alert_data)
      return unless alert_data[:organization_id]

      org = Organization.find_by(id: alert_data[:organization_id])
      return unless org

      alert_slack = org.organization_settings.find_by(key: "alert_slack")&.value == "true"
      return unless alert_slack

      Slack::NotificationService.deliver_alert(org, alert_data)
    end

    def deliver_project_slack_alerts(alert_data)
      return unless alert_data[:organization_id]

      org = Organization.find_by(id: alert_data[:organization_id])
      return unless org

      if alert_data[:project_id]
        project = org.projects.find_by(id: alert_data[:project_id])
        return unless project
        return unless ProjectSetting.get(project, "alert_slack") == "true"

        Slack::ProjectNotificationService.deliver_alert(project, alert_data)
      else
        org.projects.find_each do |project|
          next unless ProjectSetting.get(project, "alert_slack") == "true"

          Slack::ProjectNotificationService.deliver_alert(project, alert_data)
        end
      end
    end
  end
end

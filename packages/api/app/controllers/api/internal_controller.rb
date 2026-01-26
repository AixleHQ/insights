# frozen_string_literal: true

module Api
  class InternalController < ApplicationController
    skip_before_action :authenticate_user!
    skip_before_action :set_current_organization
    before_action :verify_internal_api_key!

    # POST /api/internal/tool_events
    def create_tool_event
      event = ToolEvent.create!(tool_event_params)
      render json: { data: { id: event.id } }, status: :created
    rescue ActiveRecord::RecordInvalid => e
      render json: { error: 'Validation failed', errors: e.record.errors.to_hash }, status: :unprocessable_entity
    end

    # POST /api/internal/audit_logs
    def create_audit_log
      audit_log = AuditLog.create!(audit_log_params)
      render json: { data: { id: audit_log.id } }, status: :created
    rescue ActiveRecord::RecordInvalid => e
      render json: { error: 'Validation failed', errors: e.record.errors.to_hash }, status: :unprocessable_entity
    end

    # POST /api/internal/alerts
    def create_alert
      # For now, just log the alert - can be extended to email/Slack
      alert_data = alert_params

      Rails.logger.info("[InternalAPI] Alert created: #{alert_data[:alert_type]} for org #{alert_data[:organization_id]}")

      # Broadcast via ActionCable
      if alert_data[:organization_id]
        EventsChannel.broadcast_alert(alert_data[:organization_id], alert_data)
      end

      render json: { data: { id: SecureRandom.uuid, status: 'sent' } }, status: :created
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
        render json: { error: 'Missing required parameters' }, status: :bad_request
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
      render json: { error: 'Organization not found' }, status: :not_found
    end

    private

    def verify_internal_api_key!
      api_key = ENV['INTERNAL_API_KEY']
      return if api_key.blank? # Skip verification if no key configured

      provided_key = extract_bearer_token

      unless provided_key && ActiveSupport::SecurityUtils.secure_compare(provided_key, api_key)
        render json: { error: 'Unauthorized' }, status: :unauthorized
      end
    end

    def extract_bearer_token
      auth_header = request.headers['Authorization']
      return nil unless auth_header&.start_with?('Bearer ')

      auth_header.split(' ').last
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

    def alert_params
      params.require(:alert).permit(
        :organization_id, :alert_type, :severity,
        :title, :message, metadata: {}
      ).to_h.symbolize_keys
    end
  end
end

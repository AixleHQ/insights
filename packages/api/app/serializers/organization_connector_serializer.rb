# frozen_string_literal: true

class OrganizationConnectorSerializer < BaseSerializer
  # Never expose tokens - only metadata
  attributes :id, :connector_type, :is_active, :status
  timestamps

  attribute :external_account_id do |connector|
    connector.external_org_id
  end

  attribute :external_account_name do |connector|
    connector.external_org_name
  end

  datetime_attribute :last_sync_at
  datetime_attribute :token_expires_at

  attribute :organization_id do |connector|
    connector.organization_id
  end

  attribute :last_error do |connector|
    connector.last_error
  end

  attribute :token_expired do |connector|
    connector.token_expired?
  end

  attribute :source_control do |connector|
    connector.source_control?
  end

  attribute :project_management do |connector|
    connector.project_management?
  end

  attribute :ai_provider do |connector|
    connector.ai_provider?
  end

  attribute :seat_count do |connector|
    connector.config&.dig("seat_count") if connector.copilot? || connector.cursor?
  end

  attribute :active_users_count do |connector|
    connector.config&.dig("active_users") if connector.copilot?
  end

  attribute :metered_units_used do |connector|
    connector.config&.dig("metered_units_used") if connector.copilot?
  end

  attribute :included_units do |connector|
    connector.config&.dig("included_units") if connector.copilot?
  end

  attribute :overage_units do |connector|
    connector.config&.dig("overage_units") if connector.copilot?
  end

  attribute :overage_cost_usd do |connector|
    connector.config&.dig("overage_cost_usd") if connector.copilot?
  end

  attribute :billing_model do |connector|
    connector.config&.dig("billing_model") if connector.copilot?
  end

  attribute :billing_period_start do |connector|
    connector.config&.dig("billing_period_start") if connector.copilot?
  end

  attribute :billing_period_end do |connector|
    connector.config&.dig("billing_period_end") if connector.copilot?
  end

  attribute :copilot_connector do |connector|
    connector.copilot?
  end

  attribute :overage_spend_cents do |connector|
    connector.config&.dig("overage_spend_cents") if connector.cursor?
  end

  attribute :overall_spend_cents do |connector|
    connector.config&.dig("overall_spend_cents") if connector.cursor?
  end

  attribute :fast_premium_requests do |connector|
    connector.config&.dig("fast_premium_requests") if connector.cursor?
  end

  attribute :billing_cycle_start do |connector|
    connector.config&.dig("billing_cycle_start") if connector.cursor?
  end

  attribute :repository_count do |connector|
    connector.repositories.count
  end

  attribute :synced_event_count do |connector|
    connector.synced_event_count
  end

  attribute :last_event_at do |connector|
    connector.synced_event_last_occurred_at&.iso8601
  end

  attribute :webhook_active do |connector|
    connector.webhook_active?
  end

  attribute :webhook_token do |connector|
    connector.webhook_token if connector.openrouter?
  end

  attribute :webhook_secret_set do |connector|
    connector.webhook_secret.present? if connector.openrouter?
  end

  attribute :scope do |connector|
    connector.connector_scope
  end
end

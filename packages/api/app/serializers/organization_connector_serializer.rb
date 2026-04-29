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
    connector.config&.dig("seat_count") if connector.copilot?
  end

  attribute :active_users_count do |connector|
    connector.config&.dig("active_users") if connector.copilot?
  end

  attribute :copilot_connector do |connector|
    connector.copilot?
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
end

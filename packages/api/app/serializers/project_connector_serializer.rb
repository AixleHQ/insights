# frozen_string_literal: true

class ProjectConnectorSerializer < BaseSerializer
  # Never expose tokens - only metadata
  attributes :id, :connector_type, :is_active, :status
  timestamps

  attribute :project_id do |connector|
    connector.project_id
  end

  attribute :external_account_id do |connector|
    connector.external_org_id
  end

  attribute :external_account_name do |connector|
    connector.external_org_name
  end

  datetime_attribute :last_sync_at
  datetime_attribute :token_expires_at

  attribute :last_error do |connector|
    connector.last_error
  end

  attribute :token_expired do |connector|
    connector.token_expired?
  end

  attribute :ai_provider do |connector|
    connector.ai_provider?
  end

  attribute :scope do |_connector|
    "project"
  end
end

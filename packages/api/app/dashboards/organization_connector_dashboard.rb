# frozen_string_literal: true

require "administrate/base_dashboard"

class OrganizationConnectorDashboard < Administrate::BaseDashboard
  ATTRIBUTE_TYPES = {
    id: Field::String,
    organization: Field::BelongsTo,
    connector_type: Field::Select.with_options(searchable: false, collection: OrganizationConnector::CONNECTOR_TYPES),
    is_active: Field::Boolean,
    external_account_id: Field::String,
    external_account_name: Field::String,
    last_sync_at: Field::DateTime,
    last_error: Field::Text,
    token_expires_at: Field::DateTime,
    repositories: Field::HasMany,
    created_at: Field::DateTime,
    updated_at: Field::DateTime
  }.freeze

  COLLECTION_ATTRIBUTES = %i[
    id
    organization
    connector_type
    is_active
    external_account_name
    last_sync_at
  ].freeze

  SHOW_PAGE_ATTRIBUTES = %i[
    id
    organization
    connector_type
    is_active
    external_account_id
    external_account_name
    last_sync_at
    last_error
    token_expires_at
    repositories
    created_at
    updated_at
  ].freeze

  FORM_ATTRIBUTES = %i[
    organization
    connector_type
    is_active
    external_account_id
    external_account_name
  ].freeze

  COLLECTION_FILTERS = {
    active: ->(resources) { resources.where(is_active: true) },
    github: ->(resources) { resources.where(connector_type: "github") },
    gitlab: ->(resources) { resources.where(connector_type: "gitlab") }
  }.freeze

  def display_resource(connector)
    "#{connector.connector_type} - #{connector.organization&.name}"
  end
end

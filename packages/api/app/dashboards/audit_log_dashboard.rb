# frozen_string_literal: true

require 'administrate/base_dashboard'

class AuditLogDashboard < Administrate::BaseDashboard
  ATTRIBUTE_TYPES = {
    id: Field::String,
    organization: Field::BelongsTo,
    user: Field::BelongsTo,
    action: Field::String,
    resource_type: Field::String,
    resource_id: Field::String,
    details: Field::Text,
    ip_address: Field::String,
    user_agent: Field::String,
    created_at: Field::DateTime
  }.freeze

  COLLECTION_ATTRIBUTES = %i[
    id
    organization
    user
    action
    resource_type
    created_at
  ].freeze

  SHOW_PAGE_ATTRIBUTES = %i[
    id
    organization
    user
    action
    resource_type
    resource_id
    details
    ip_address
    user_agent
    created_at
  ].freeze

  # Audit logs are read-only
  FORM_ATTRIBUTES = [].freeze

  COLLECTION_FILTERS = {}.freeze

  def display_resource(log)
    "#{log.action} #{log.resource_type} - #{log.created_at&.strftime('%Y-%m-%d %H:%M')}"
  end
end

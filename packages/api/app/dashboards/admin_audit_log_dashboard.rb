# frozen_string_literal: true

require 'administrate/base_dashboard'

class AdminAuditLogDashboard < Administrate::BaseDashboard
  ATTRIBUTE_TYPES = {
    id: Field::String,
    admin_user: Field::BelongsTo.with_options(class_name: 'User'),
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
    admin_user
    action
    resource_type
    resource_id
    created_at
  ].freeze

  SHOW_PAGE_ATTRIBUTES = %i[
    id
    admin_user
    action
    resource_type
    resource_id
    details
    ip_address
    user_agent
    created_at
  ].freeze

  # Admin audit logs are read-only
  FORM_ATTRIBUTES = [].freeze

  COLLECTION_FILTERS = {}.freeze

  def display_resource(log)
    "#{log.action} #{log.resource_type} by #{log.admin_user&.display_name}"
  end
end

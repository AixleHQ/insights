# frozen_string_literal: true

require "administrate/base_dashboard"

class SanitizationPolicyDashboard < Administrate::BaseDashboard
  ATTRIBUTE_TYPES = {
    id: Field::String,
    name: Field::String,
    description: Field::Text,
    pattern: Field::String,
    replacement: Field::String,
    is_active: Field::Boolean,
    is_global: Field::Boolean,
    priority: Field::Number,
    created_at: Field::DateTime,
    updated_at: Field::DateTime
  }.freeze

  COLLECTION_ATTRIBUTES = %i[
    id
    name
    pattern
    is_active
    is_global
    priority
  ].freeze

  SHOW_PAGE_ATTRIBUTES = %i[
    id
    name
    description
    pattern
    replacement
    is_active
    is_global
    priority
    created_at
    updated_at
  ].freeze

  FORM_ATTRIBUTES = %i[
    name
    description
    pattern
    replacement
    is_active
    is_global
    priority
  ].freeze

  COLLECTION_FILTERS = {
    active: ->(resources) { resources.where(is_active: true) },
    global: ->(resources) { resources.where(is_global: true) }
  }.freeze

  def display_resource(policy)
    policy.name
  end
end

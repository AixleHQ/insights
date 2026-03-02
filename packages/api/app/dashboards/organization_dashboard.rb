# frozen_string_literal: true

require "administrate/base_dashboard"

class OrganizationDashboard < Administrate::BaseDashboard
  ATTRIBUTE_TYPES = {
    id: Field::String,
    name: Field::String,
    slug: Field::String,
    description: Field::Text,
    is_active: Field::Boolean,
    organization_memberships: Field::HasMany,
    members: Field::HasMany.with_options(class_name: "User"),
    organization_settings: Field::HasMany,
    retention_policy: Field::HasOne.with_options(class_name: "OrganizationRetentionPolicy"),
    organization_connectors: Field::HasMany,
    projects: Field::HasMany,
    created_at: Field::DateTime,
    updated_at: Field::DateTime
  }.freeze

  COLLECTION_ATTRIBUTES = %i[
    id
    name
    slug
    is_active
    created_at
  ].freeze

  SHOW_PAGE_ATTRIBUTES = %i[
    id
    name
    slug
    description
    is_active
    retention_policy
    organization_connectors
    projects
    created_at
    updated_at
  ].freeze

  FORM_ATTRIBUTES = %i[
    name
    slug
    description
    is_active
  ].freeze

  COLLECTION_FILTERS = {
    active: ->(resources) { resources.where(is_active: true) },
    inactive: ->(resources) { resources.where(is_active: false) }
  }.freeze

  def display_resource(organization)
    organization.name
  end
end

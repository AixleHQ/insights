# frozen_string_literal: true

require "administrate/base_dashboard"

class ProjectDashboard < Administrate::BaseDashboard
  ATTRIBUTE_TYPES = {
    id: Field::String,
    name: Field::String,
    slug: Field::String,
    description: Field::Text,
    is_active: Field::Boolean,
    organization: Field::BelongsTo,
    owner: Field::BelongsTo.with_options(class_name: "User"),
    project_memberships: Field::HasMany,
    members: Field::HasMany.with_options(class_name: "User"),
    project_settings: Field::HasMany,
    repositories: Field::HasMany,
    created_at: Field::DateTime,
    updated_at: Field::DateTime
  }.freeze

  COLLECTION_ATTRIBUTES = %i[
    id
    name
    slug
    organization
    owner
    is_active
    created_at
  ].freeze

  SHOW_PAGE_ATTRIBUTES = %i[
    id
    name
    slug
    description
    is_active
    organization
    owner
    repositories
    created_at
    updated_at
  ].freeze

  FORM_ATTRIBUTES = %i[
    name
    slug
    description
    is_active
    organization
    owner
  ].freeze

  COLLECTION_FILTERS = {
    active: ->(resources) { resources.where(is_active: true) },
    organization: ->(resources) { resources.where.not(organization_id: nil) },
    personal: ->(resources) { resources.where.not(owner_id: nil) }
  }.freeze

  def display_resource(project)
    project.name
  end
end

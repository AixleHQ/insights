# frozen_string_literal: true

require 'administrate/base_dashboard'

class UserDashboard < Administrate::BaseDashboard
  ATTRIBUTE_TYPES = {
    id: Field::String,
    keycloak_sub: Field::String,
    email: Field::Email,
    name: Field::String,
    avatar_url: Field::String,
    global_admin: Field::Boolean,
    organization_memberships: Field::HasMany,
    organizations: Field::HasMany,
    project_memberships: Field::HasMany,
    projects: Field::HasMany,
    owned_projects: Field::HasMany.with_options(class_name: 'Project'),
    user_settings: Field::HasMany,
    created_at: Field::DateTime,
    updated_at: Field::DateTime
  }.freeze

  COLLECTION_ATTRIBUTES = %i[
    id
    email
    name
    global_admin
    created_at
  ].freeze

  SHOW_PAGE_ATTRIBUTES = %i[
    id
    keycloak_sub
    email
    name
    avatar_url
    global_admin
    organizations
    owned_projects
    created_at
    updated_at
  ].freeze

  FORM_ATTRIBUTES = %i[
    email
    name
    avatar_url
    global_admin
  ].freeze

  COLLECTION_FILTERS = {
    global_admin: ->(resources) { resources.where(global_admin: true) }
  }.freeze

  def display_resource(user)
    user.display_name
  end
end

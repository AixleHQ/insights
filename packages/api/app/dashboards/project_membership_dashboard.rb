# frozen_string_literal: true

require "administrate/base_dashboard"

class ProjectMembershipDashboard < Administrate::BaseDashboard
  ATTRIBUTE_TYPES = {
    id: Field::String,
    user: Field::BelongsTo,
    project: Field::BelongsTo,
    role: Field::Select.with_options(searchable: false, collection: ProjectMembership::ROLES),
    created_at: Field::DateTime,
    updated_at: Field::DateTime
  }.freeze

  COLLECTION_ATTRIBUTES = %i[
    id
    user
    project
    role
    created_at
  ].freeze

  SHOW_PAGE_ATTRIBUTES = %i[
    id
    user
    project
    role
    created_at
    updated_at
  ].freeze

  FORM_ATTRIBUTES = %i[
    user
    project
    role
  ].freeze

  COLLECTION_FILTERS = {
    owners: ->(resources) { resources.where(role: "owner") },
    admins: ->(resources) { resources.where(role: %w[owner admin]) }
  }.freeze

  def display_resource(membership)
    "#{membership.user&.display_name} - #{membership.project&.name}"
  end
end

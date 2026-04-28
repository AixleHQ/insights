# frozen_string_literal: true

require "administrate/base_dashboard"

class OrganizationMembershipDashboard < Administrate::BaseDashboard
  ATTRIBUTE_TYPES = {
    id: Field::String,
    user: Field::BelongsTo,
    organization: Field::BelongsTo,
    role: Field::Select.with_options(searchable: false, collection: OrganizationMembership::ROLES),
    user_tool_accounts: Field::HasMany,
    created_at: Field::DateTime,
    updated_at: Field::DateTime
  }.freeze

  COLLECTION_ATTRIBUTES = %i[
    id
    user
    organization
    role
    created_at
  ].freeze

  SHOW_PAGE_ATTRIBUTES = %i[
    id
    user
    organization
    role
    user_tool_accounts
    created_at
    updated_at
  ].freeze

  FORM_ATTRIBUTES = %i[
    user
    organization
    role
  ].freeze

  COLLECTION_FILTERS = {
    owners: ->(resources) { resources.where(role: "owner") },
    admins: ->(resources) { resources.where(role: %w[owner admin]) }
  }.freeze

  def display_resource(membership)
    "#{membership.user&.display_name} - #{membership.organization&.name}"
  end
end

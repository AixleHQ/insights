# frozen_string_literal: true

require "administrate/base_dashboard"

class UserToolAccountDashboard < Administrate::BaseDashboard
  ATTRIBUTE_TYPES = {
    id: Field::String,
    organization_membership: Field::BelongsTo,
    tool_name: Field::Select.with_options(searchable: false, collection: UserToolAccount::TOOL_NAMES),
    connection_state: Field::String,
    external_user_id: Field::String,
    external_username: Field::String,
    external_email: Field::String,
    token_expires_at: Field::DateTime,
    created_at: Field::DateTime,
    updated_at: Field::DateTime
  }.freeze

  COLLECTION_ATTRIBUTES = %i[
    id
    organization_membership
    tool_name
    connection_state
    external_username
  ].freeze

  SHOW_PAGE_ATTRIBUTES = %i[
    id
    organization_membership
    tool_name
    connection_state
    external_user_id
    external_username
    external_email
    token_expires_at
    created_at
    updated_at
  ].freeze

  FORM_ATTRIBUTES = %i[
    organization_membership
    tool_name
    connection_state
    external_user_id
    external_username
    external_email
  ].freeze

  COLLECTION_FILTERS = {
    active: ->(resources) { resources.where(connection_state: "active") }
  }.freeze

  def display_resource(account)
    "#{account.tool_name} - #{account.external_username}"
  end
end

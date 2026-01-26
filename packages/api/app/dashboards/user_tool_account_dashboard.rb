# frozen_string_literal: true

require 'administrate/base_dashboard'

class UserToolAccountDashboard < Administrate::BaseDashboard
  ATTRIBUTE_TYPES = {
    id: Field::String,
    organization_membership: Field::BelongsTo,
    tool_name: Field::Select.with_options(searchable: false, collection: UserToolAccount::TOOL_NAMES),
    is_active: Field::Boolean,
    external_account_id: Field::String,
    external_account_name: Field::String,
    token_expires_at: Field::DateTime,
    created_at: Field::DateTime,
    updated_at: Field::DateTime
  }.freeze

  COLLECTION_ATTRIBUTES = %i[
    id
    organization_membership
    tool_name
    is_active
    external_account_name
  ].freeze

  SHOW_PAGE_ATTRIBUTES = %i[
    id
    organization_membership
    tool_name
    is_active
    external_account_id
    external_account_name
    token_expires_at
    created_at
    updated_at
  ].freeze

  FORM_ATTRIBUTES = %i[
    organization_membership
    tool_name
    is_active
    external_account_id
    external_account_name
  ].freeze

  COLLECTION_FILTERS = {
    active: ->(resources) { resources.where(is_active: true) }
  }.freeze

  def display_resource(account)
    "#{account.tool_name} - #{account.external_account_name}"
  end
end

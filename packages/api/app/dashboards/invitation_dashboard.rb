# frozen_string_literal: true

require "administrate/base_dashboard"

class InvitationDashboard < Administrate::BaseDashboard
  ATTRIBUTE_TYPES = {
    id:           Field::String,
    email:        Field::String,
    role:         Field::Select.with_options(searchable: false, collection: Invitation::ROLES),
    status:       Field::Select.with_options(searchable: false, collection: Invitation::STATUSES),
    organization: Field::BelongsTo,
    invited_by:   Field::BelongsTo,
    expires_at:   Field::DateTime,
    accepted_at:  Field::DateTime,
    created_at:   Field::DateTime
  }.freeze

  COLLECTION_ATTRIBUTES = %i[
    id
    email
    role
    status
    organization
    invited_by
    expires_at
    created_at
  ].freeze

  SHOW_PAGE_ATTRIBUTES = %i[
    id
    email
    role
    status
    organization
    invited_by
    expires_at
    accepted_at
    created_at
  ].freeze

  FORM_ATTRIBUTES = %i[
    email
    organization
    role
    expires_at
  ].freeze

  COLLECTION_FILTERS = {
    pending:  ->(resources) { resources.where(status: "pending") },
    accepted: ->(resources) { resources.where(status: "accepted") },
    revoked:  ->(resources) { resources.where(status: "revoked") },
    expired:  ->(resources) { resources.where(status: "expired").or(resources.where(status: "pending").where("expires_at < ?", Time.current)) }
  }.freeze

  def display_resource(invitation)
    "#{invitation.email} (#{invitation.status})"
  end
end

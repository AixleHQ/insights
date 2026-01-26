# frozen_string_literal: true

class UserToolAccountSerializer < BaseSerializer
  # Never expose tokens - only metadata
  attributes :id, :tool_name, :is_active, :external_user_id, :external_username, :external_email
  timestamps

  datetime_attribute :token_expires_at

  attribute :organization_membership_id do |account|
    account.organization_membership_id
  end

  attribute :token_expired do |account|
    account.token_expired?
  end
end

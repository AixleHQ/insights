# frozen_string_literal: true

class OrganizationMembershipSerializer < BaseSerializer
  attributes :id, :role
  timestamps

  attribute :user do |membership|
    ::UserMinimalSerializer.new(membership.user).serializable_hash
  end

  attribute :organization_id do |membership|
    membership.organization_id
  end
end

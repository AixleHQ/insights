# frozen_string_literal: true

class OrganizationMembershipWithOrgSerializer < OrganizationMembershipSerializer
  attribute :organization do |membership|
    ::OrganizationMinimalSerializer.new(membership.organization).serializable_hash
  end
end

# frozen_string_literal: true

class OrganizationFullSerializer < OrganizationSerializer
  attribute :retention_policy do |org|
    if org.retention_policy
      ::OrganizationRetentionPolicySerializer.new(org.retention_policy).serializable_hash
    end
  end

  attribute :member_count do |org|
    org.members.count
  end

  attribute :project_count do |org|
    org.projects.count
  end
end

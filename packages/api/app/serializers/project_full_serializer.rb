# frozen_string_literal: true

class ProjectFullSerializer < ProjectSerializer
  attribute :organization do |project|
    if project.organization
      ::OrganizationMinimalSerializer.new(project.organization).serializable_hash
    end
  end

  attribute :owner do |project|
    if project.owner
      ::UserMinimalSerializer.new(project.owner).serializable_hash
    end
  end

  attribute :member_count do |project|
    project.members.count
  end

  attribute :repository_count do |project|
    project.repositories.count
  end

  attribute :retention_policy do |project|
    if project.retention_policy
      ::ProjectRetentionPolicySerializer.new(project.retention_policy).serializable_hash
    end
  end

  attribute :jira_project_key do |project|
    project.project_settings.to_a.find { |s| s.key == "jira_project_key" }&.value
  end

  attribute :jira_connector_id do |project|
    project.project_settings.to_a.find { |s| s.key == "jira_connector_id" }&.value
  end
end

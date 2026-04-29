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

  attribute :source_control_summary do |project|
    repositories_by_provider = project.repositories.includes(:organization_connector).group_by(&:provider)

    repositories_by_provider.map do |provider, repositories|
      repo_ids = repositories.map(&:id)
      events = project.tool_events.where(repository_id: repo_ids)

      {
        "provider" => provider,
        "repositoryCount" => repositories.count,
        "commitCount" => events.by_event_type("commit").count,
        "reviewCount" => events.by_event_type("review").count,
        "pipelineCount" => events.by_event_type("other").where("metadata ? 'pipeline_id'").count,
        "lastActivityAt" => events.maximum(:occurred_at)&.iso8601,
        "lastSyncAt" => repositories.map(&:last_sync_at).compact.max&.iso8601
      }
    end
  end
end

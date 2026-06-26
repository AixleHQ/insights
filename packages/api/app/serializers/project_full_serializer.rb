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

  attribute :linear_project_id do |project|
    project.project_settings.to_a.find { |s| s.key == "linear_project_id" }&.value
  end

  attribute :linear_project_name do |project|
    project.project_settings.to_a.find { |s| s.key == "linear_project_name" }&.value
  end

  attribute :linear_connector_id do |project|
    project.project_settings.to_a.find { |s| s.key == "linear_connector_id" }&.value
  end

  attribute :issues_synced_at do |project|
    project.issues_synced_at&.iso8601
  end

  attribute :source_control_summary do |project|
    ProjectFullSerializer.build_source_control_summary(project)
  end

  class << self
    def build_source_control_summary(project)
      repositories_by_provider = project.repositories.includes(:organization_connector).group_by(&:provider)
      all_repo_ids = repositories_by_provider.values.flatten.map(&:id)
      return [] if all_repo_ids.empty?

      events_scope = project.tool_events.where(repository_id: all_repo_ids)
      aggregates = source_control_event_aggregates(events_scope)

      repositories_by_provider.map do |provider, repositories|
        source_control_provider_row(provider, repositories, aggregates)
      end
    end

    private

    def source_control_event_aggregates(events_scope)
      {
        counts_by_repo_and_type: events_scope.group(:repository_id, :event_type).count,
        pipeline_counts_by_repo_and_tool: events_scope
          .by_event_type("other")
          .where("jsonb_exists(metadata, ?)", "pipeline_id")
          .group(:repository_id, :tool_name)
          .count,
        max_occurred_at_by_repo: events_scope.group(:repository_id).maximum(:occurred_at)
      }
    end

    def source_control_provider_row(provider, repositories, aggregates)
      counts = aggregates.fetch(:counts_by_repo_and_type)
      pipelines = aggregates.fetch(:pipeline_counts_by_repo_and_tool)
      max_at = aggregates.fetch(:max_occurred_at_by_repo)

      repo_ids = repositories.map(&:id)
      commit_count = repo_ids.sum { |rid| counts[[ rid, "commit" ]] || 0 }
      review_count = repo_ids.sum { |rid| counts[[ rid, "review" ]] || 0 }
      pipeline_count = repo_ids.sum { |rid| pipelines[[ rid, provider ]] || 0 }
      last_activity_at = repo_ids.filter_map { |rid| max_at[rid] }.max

      {
        "provider" => provider,
        "repositoryCount" => repositories.size,
        "commitCount" => commit_count,
        "reviewCount" => review_count,
        "pipelineCount" => pipeline_count,
        "lastActivityAt" => last_activity_at&.iso8601,
        "lastSyncAt" => repositories.map(&:last_sync_at).compact.max&.iso8601
      }
    end
  end

  attribute :issue_throughput_summary do |project|
    # Use pre-loaded project_settings (via .to_a) to avoid extra queries.
    linear_connector_id = project.project_settings.to_a.find { |s| s.key == "linear_connector_id" }&.value
    next [] if linear_connector_id.blank?

    # project.issues is already scoped to this project — no org-wide fan-out.
    issues = project.issues.where(organization_connector_id: linear_connector_id).to_a
    next [] if issues.empty?

    connector = project.organization&.organization_connectors&.find_by(id: linear_connector_id)

    [
      {
        "provider"         => "linear",
        "issueCount"       => issues.size,
        "completedCount"   => issues.count { |i| i.status_category == "done" },
        "stateChangeCount" => issues.count { |i| i.external_updated_at && i.external_created_at && i.external_updated_at != i.external_created_at },
        "cycleCount"       => issues.filter_map { |i| i.metadata&.dig("cycle_id") }.uniq.size,
        "lastActivityAt"   => issues.filter_map(&:external_updated_at).max&.iso8601,
        "lastSyncAt"       => connector&.last_sync_at&.iso8601
      }
    ]
  end
end

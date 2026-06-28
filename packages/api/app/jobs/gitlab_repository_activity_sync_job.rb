# frozen_string_literal: true

# Handles activity sync (commits, MRs, pipelines) for a single GitLab repository.
# Enqueued in bulk by GitlabSyncJob when fan-out mode is active — one job per repo.
# When all per-repo jobs finish, the last one calls connector.mark_synced! via a
# decrementing counter on organization_connectors.pending_activity_jobs.
class GitlabRepositoryActivitySyncJob < ApplicationJob
  queue_as :connectors

  def perform(connector_id, repository_id)
    connector  = OrganizationConnector.find(connector_id)
    repository = connector.repositories.find(repository_id)

    member_by_email = connector.organization.members.index_by { |m| m.email.downcase }

    commits_future = Concurrent::Promises.future do
      Oauth::GitlabProvider.new(connector).fetch_commits(
        repository.external_id,
        ref_name: repository.default_branch,
        since: GitlabSyncJob::SYNC_WINDOW.ago
      )
    end

    mrs_future = Concurrent::Promises.future do
      Oauth::GitlabProvider.new(connector).fetch_merge_requests(
        repository.external_id,
        updated_after: GitlabSyncJob::SYNC_WINDOW.ago
      )
    end

    pipelines_future = Concurrent::Promises.future do
      Oauth::GitlabProvider.new(connector).fetch_pipelines(
        repository.external_id,
        updated_after: GitlabSyncJob::SYNC_WINDOW.ago
      )
    end

    commits   = commits_future.value!
    mrs       = mrs_future.value!
    pipelines = pipelines_future.value!

    commits.each { |commit| create_commit_event(connector, repository, commit, member_by_email) }
    persist_merge_requests(connector, repository, mrs)
    persist_pipelines(connector, repository, pipelines)

    repository.mark_synced!
    decrement_and_maybe_mark_synced!(connector)
  rescue ActiveRecord::RecordNotFound => e
    Rails.logger.error("[GitlabRepositoryActivitySyncJob] Record not found: #{e.message}")
    decrement_and_maybe_mark_synced!(connector) if defined?(connector) && connector
  rescue StandardError => e
    Rails.logger.error("[GitlabRepositoryActivitySyncJob] Failed for repo #{repository_id}: #{e.message}")
    decrement_and_maybe_mark_synced!(connector) if defined?(connector) && connector
    raise
  end

  private

  def create_commit_event(connector, repository, commit, member_by_email)
    author_email = commit.dig("author", "email")&.downcase
    user = member_by_email[author_email] if author_email

    ToolEvents::ConnectorUpsert.call(
      unique_key: "sha",
      unique_value: commit["id"],
      organization_id: connector.organization_id,
      user_id: user&.id,
      repository_id: repository.id,
      project_id: repository.project_id,
      tool_name: "gitlab",
      event_type: "commit",
      occurred_at: Time.parse(commit["timestamp"]),
      metadata: {
        sha: commit["id"],
        message: commit["message"],
        author_name: commit.dig("author", "name"),
        git_author_email: author_email,
        url: commit["url"]
      }
    )
  end

  def persist_merge_requests(connector, repository, merge_requests)
    merge_requests.each do |mr|
      ToolEvents::ConnectorUpsert.call(
        unique_key: "mr_iid",
        unique_value: mr[:iid],
        organization_id: connector.organization_id,
        repository_id: repository.id,
        project_id: repository.project_id,
        tool_name: "gitlab",
        event_type: "review",
        occurred_at: Time.parse(mr[:updated_at]),
        metadata: {
          mr_iid: mr[:iid],
          mr_title: mr[:title],
          mr_state: mr[:state],
          repository_id: repository.id,
          author: mr[:author_username],
          url: mr[:web_url]
        }
      )
    end
  end

  def persist_pipelines(connector, repository, pipelines)
    pipelines.each do |pipeline|
      ToolEvents::ConnectorUpsert.call(
        unique_key: "pipeline_id",
        unique_value: pipeline[:id],
        organization_id: connector.organization_id,
        repository_id: repository.id,
        project_id: repository.project_id,
        tool_name: "gitlab",
        event_type: "other",
        occurred_at: Time.parse(pipeline[:updated_at]),
        metadata: {
          pipeline_id: pipeline[:id],
          status: pipeline[:status],
          ref: pipeline[:ref],
          repository_id: repository.id,
          duration: pipeline[:duration],
          sha: pipeline[:sha],
          url: pipeline[:web_url]
        }
      )
    end
  end

  # Atomically decrements pending_activity_jobs; calls mark_synced! when counter reaches zero.
  # Uses a row lock so concurrent workers don't race on the counter.
  def decrement_and_maybe_mark_synced!(connector)
    connector.with_lock do
      remaining = connector.pending_activity_jobs.to_i - 1
      remaining = 0 if remaining < 0
      connector.update_column(:pending_activity_jobs, remaining)
      connector.mark_synced!(sync_started_at: connector.activity_sync_started_at) if remaining.zero?
    end
  rescue StandardError => e
    Rails.logger.error("[GitlabRepositoryActivitySyncJob] Counter decrement failed: #{e.message}")
  end
end

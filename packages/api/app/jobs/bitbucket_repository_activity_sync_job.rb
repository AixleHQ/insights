# frozen_string_literal: true

# Handles activity sync (commits, PRs, pipelines) for a single Bitbucket repository.
# Enqueued in bulk by BitbucketSyncJob when fan-out mode is active — one job per repo.
# When all per-repo jobs finish, the last one calls connector.mark_synced! via a
# decrementing counter on organization_connectors.pending_activity_jobs.
class BitbucketRepositoryActivitySyncJob < ApplicationJob
  queue_as :connectors

  def perform(connector_id, repository_id)
    connector  = OrganizationConnector.find(connector_id)
    repository = connector.repositories.find(repository_id)

    workspace, repo_slug = repository.full_name.to_s.split("/", 2)
    if workspace.blank? || repo_slug.blank?
      Rails.logger.warn("[BitbucketRepositoryActivitySyncJob] Skipping repo #{repository_id}: invalid full_name '#{repository.full_name}'")
      decrement_and_maybe_mark_synced!(connector)
      return
    end

    member_by_email = connector.organization.members.index_by { |m| m.email.downcase }

    # Warm the token in the main thread before spawning futures to avoid a
    # concurrent refresh race inside the parallel provider instances.
    prewarm = Oauth::BitbucketProvider.new(connector)
    prewarm.send(:ensure_fresh_token!)
    connector.reload

    commits_future = Concurrent::Promises.future do
      Oauth::BitbucketProvider.new(connector).fetch_commits(
        workspace,
        repo_slug,
        branch: repository.default_branch.presence || "main",
        since: BitbucketSyncJob::SYNC_WINDOW.ago
      )
    end

    prs_future = Concurrent::Promises.future do
      Oauth::BitbucketProvider.new(connector).fetch_pull_requests(
        workspace,
        repo_slug,
        updated_after: BitbucketSyncJob::SYNC_WINDOW.ago
      )
    end

    pipelines_future = Concurrent::Promises.future do
      Oauth::BitbucketProvider.new(connector).fetch_pipelines(
        workspace,
        repo_slug,
        updated_after: BitbucketSyncJob::SYNC_WINDOW.ago
      )
    end

    commits   = commits_future.value!
    prs       = prs_future.value!
    pipelines = pipelines_future.value!

    commits.each { |commit| create_commit_event(connector, repository, commit, member_by_email) }
    persist_pull_requests(connector, repository, prs)
    persist_pipelines(connector, repository, pipelines)

    repository.mark_synced!
    decrement_and_maybe_mark_synced!(connector)
  rescue ActiveRecord::RecordNotFound => e
    Rails.logger.error("[BitbucketRepositoryActivitySyncJob] Record not found: #{e.message}")
    decrement_and_maybe_mark_synced!(connector) if defined?(connector) && connector
  rescue StandardError => e
    Rails.logger.error("[BitbucketRepositoryActivitySyncJob] Failed for repo #{repository_id}: #{e.message}")
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
      tool_name: "bitbucket",
      event_type: "commit",
      occurred_at: Time.parse(commit["timestamp"]),
      metadata: {
        sha: commit["id"],
        message: commit["message"],
        author_name: commit.dig("author", "name"),
        git_author_email: author_email
      }
    )
  end

  def persist_pull_requests(connector, repository, pull_requests)
    pull_requests.each do |pr|
      ToolEvents::ConnectorUpsert.call(
        unique_key: "pullrequest_id",
        unique_value: pr[:id],
        organization_id: connector.organization_id,
        repository_id: repository.id,
        project_id: repository.project_id,
        tool_name: "bitbucket",
        event_type: "review",
        occurred_at: Time.parse(pr[:updated_at]),
        metadata: {
          pullrequest_id: pr[:id],
          pr_title: pr[:title],
          pr_state: pr[:state],
          repository_id: repository.id,
          author: pr[:author_username],
          url: pr[:web_url]
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
        tool_name: "bitbucket",
        event_type: "other",
        occurred_at: Time.parse(pipeline[:updated_at]),
        metadata: {
          pipeline_id: pipeline[:id],
          status: pipeline[:status],
          ref: pipeline[:ref],
          repository_id: repository.id,
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
      connector.mark_synced! if remaining.zero?
    end
  rescue StandardError => e
    Rails.logger.error("[BitbucketRepositoryActivitySyncJob] Counter decrement failed: #{e.message}")
  end
end

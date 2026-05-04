# frozen_string_literal: true

class BitbucketSyncJob < ApplicationJob
  queue_as :connectors
  SYNC_WINDOW = 30.days

  def perform(connector_id, action = "sync", options = {})
    @connector = OrganizationConnector.find(connector_id)
    @options = options.symbolize_keys

    Rails.logger.info("[BitbucketSyncJob] Starting #{action} for connector #{connector_id}")

    case action
    when "sync"
      fanout = sync_repositories
      # When fan-out is active, mark_synced! is deferred to the last child job.
      return if fanout
    when "webhook"
      process_webhook
    else
      Rails.logger.warn("[BitbucketSyncJob] Unknown action: #{action}")
    end

    @connector.mark_synced!
    Rails.logger.info("[BitbucketSyncJob] Completed #{action} for connector #{connector_id}")
  rescue ActiveRecord::RecordNotFound
    Rails.logger.error("[BitbucketSyncJob] Connector #{connector_id} not found")
  rescue Oauth::TokenRefreshError => e
    Rails.logger.error("[BitbucketSyncJob] Token refresh failed for connector #{connector_id}: #{e.message}")
  rescue StandardError => e
    Rails.logger.error("[BitbucketSyncJob] Failed: #{e.message}")
    raise
  end

  private

  # Returns true when fan-out mode is active (BITBUCKET_FANOUT=true env var).
  # In fan-out mode, one BitbucketRepositoryActivitySyncJob is enqueued per repo;
  # mark_synced! is deferred to the last child via a counter on the connector.
  def sync_repositories
    provider = Oauth::BaseProvider.for(@connector)
    repos = provider.fetch_repositories(all_pages: true)

    repos.each do |repo_data|
      sync_repository(repo_data)
    end

    if fanout_enabled?
      enqueue_activity_jobs
      return true
    end

    sync_recent_activity(provider)
    false
  end

  def fanout_enabled?
    ENV["BITBUCKET_FANOUT"].to_s.downcase == "true"
  end

  # Sets the pending counter and enqueues one child job per repository.
  # The counter is set atomically before any child starts so no race is possible.
  def enqueue_activity_jobs
    repo_ids = @connector.repositories.pluck(:id)
    return if repo_ids.empty?

    @connector.update_column(:pending_activity_jobs, repo_ids.size)
    Rails.logger.info("[BitbucketSyncJob] Fan-out: enqueuing #{repo_ids.size} activity jobs for connector #{@connector.id}")

    repo_ids.each do |repo_id|
      BitbucketRepositoryActivitySyncJob.perform_later(@connector.id, repo_id)
    end
  end

  def sync_repository(repo_data)
    repository = Repository.find_or_initialize_by(
      organization_connector: @connector,
      external_id: repo_data[:external_id].to_s
    )

    repository.update!(
      name: repo_data[:name],
      full_name: repo_data[:full_name],
      url: repo_data[:html_url],
      html_url: repo_data[:html_url],
      clone_url: repo_data[:clone_url],
      default_branch: repo_data[:default_branch],
      is_private: repo_data[:is_private],
      description: repo_data[:description]
    )
  end

  def sync_recent_activity(provider)
    # Warm the token once before iterating so per-repo parallel futures don't race on refresh.
    provider.send(:ensure_fresh_token!)
    @connector.reload

    @connector.repositories.find_each do |repository|
      sync_repository_activity(repository)
      repository.mark_synced!
    end
  end

  # Fetches commits, PRs, and pipelines for a single repository in parallel.
  # Each fetch spawns its own BitbucketProvider instance to avoid sharing the
  # memoized Faraday connection across threads.
  def sync_repository_activity(repository)
    workspace, repo_slug = repository_coordinates(repository)
    return if workspace.blank? || repo_slug.blank?

    commits_future = Concurrent::Promises.future do
      Oauth::BitbucketProvider.new(@connector).fetch_commits(
        workspace,
        repo_slug,
        branch: repository.default_branch.presence || "main",
        since: SYNC_WINDOW.ago
      )
    end

    prs_future = Concurrent::Promises.future do
      Oauth::BitbucketProvider.new(@connector).fetch_pull_requests(
        workspace,
        repo_slug,
        updated_after: SYNC_WINDOW.ago
      )
    end

    pipelines_future = Concurrent::Promises.future do
      Oauth::BitbucketProvider.new(@connector).fetch_pipelines(
        workspace,
        repo_slug,
        updated_after: SYNC_WINDOW.ago
      )
    end

    commits   = commits_future.value!
    prs       = prs_future.value!
    pipelines = pipelines_future.value!

    member_by_email = load_member_by_email
    commits.each { |commit| create_commit_event(repository, commit, member_by_email) }
    sync_pull_requests_data(repository, prs)
    sync_pipelines_data(repository, pipelines)
  end

  def process_webhook
    event_type = @options[:event_type]
    payload = @options[:payload]

    case event_type
    when "repo:push"
      process_push_event(payload)
    when "pullrequest:created", "pullrequest:updated", "pullrequest:fulfilled", "pullrequest:rejected"
      process_pull_request_event(payload, event_type)
    when "pipeline:created", "pipeline:started", "pipeline:completed"
      process_pipeline_event(payload)
    else
      Rails.logger.info("[BitbucketSyncJob] Ignoring webhook event: #{event_type}")
    end
  end

  def process_push_event(payload)
    repository = find_repository(payload.dig("repository", "uuid"))
    return unless repository

    changes = payload.dig("push", "changes") || []
    all_commits = changes.flat_map { |change| change["commits"] || [] }
    return if all_commits.empty?

    member_by_email = load_member_by_email
    all_commits.each { |commit| create_commit_event(repository, commit, member_by_email) }
  end

  def process_pull_request_event(payload, event_type)
    repository = find_repository(payload.dig("repository", "uuid"))
    return unless repository

    pr = payload["pullrequest"]
    action = event_type.split(":").last

    ToolEvents::ConnectorUpsert.call(
      unique_key: "pullrequest_id",
      unique_value: pr["id"],
      organization_id: @connector.organization_id,
      repository_id: repository.id,
      project_id: repository.project_id,
      tool_name: "bitbucket",
      event_type: "review",
      occurred_at: Time.parse(pr["updated_on"] || Time.current.iso8601),
      metadata: {
        action: action,
        pullrequest_id: pr["id"],
        pr_title: pr["title"],
        pr_state: pr["state"],
        repository_id: repository.id,
        author: pr.dig("author", "display_name"),
        url: pr.dig("links", "html", "href")
      }
    )
  end

  def process_pipeline_event(payload)
    repository = find_repository(payload.dig("repository", "uuid"))
    return unless repository

    pipeline = payload["pipeline"]
    return if pipeline.blank?

    pipeline_id = pipeline["uuid"] || pipeline["build_number"]

    ToolEvents::ConnectorUpsert.call(
      unique_key: "pipeline_id",
      unique_value: pipeline_id,
      organization_id: @connector.organization_id,
      repository_id: repository.id,
      project_id: repository.project_id,
      tool_name: "bitbucket",
      event_type: "other",
      occurred_at: Time.parse(pipeline["completed_on"] || pipeline["created_on"] || Time.current.iso8601),
      metadata: {
        pipeline_id: pipeline_id,
        status: pipeline.dig("state", "name"),
        ref: pipeline.dig("target", "ref_name"),
        repository_id: repository.id,
        sha: pipeline.dig("target", "commit", "hash"),
        url: pipeline.dig("links", "html", "href")
      }
    )
  end

  def find_repository(external_id)
    @connector.repositories.find_by(external_id: external_id)
  end

  def load_member_by_email
    @connector.organization.members.index_by { |member| member.email.downcase }
  end

  def create_commit_event(repository, commit, member_by_email = {})
    author_email = commit.dig("author", "email") || Oauth::BitbucketProvider.extract_email(commit.dig("author", "raw"))
    user = member_by_email[author_email] if author_email

    ToolEvents::ConnectorUpsert.call(
      unique_key: "sha",
      unique_value: commit["hash"] || commit["id"],
      organization_id: @connector.organization_id,
      user_id: user&.id,
      repository_id: repository.id,
      project_id: repository.project_id,
      tool_name: "bitbucket",
      event_type: "commit",
      occurred_at: Time.parse(commit["date"] || commit["timestamp"] || Time.current.iso8601),
      metadata: {
        sha: commit["hash"] || commit["id"],
        message: commit["message"],
        author_name: commit.dig("author", "user", "display_name") || commit.dig("author", "name"),
        git_author_email: author_email
      }
    )
  end

  def sync_pull_requests_data(repository, pull_requests)
    return if pull_requests.empty?

    records = pull_requests.map do |pull_request|
      {
        unique_value:    pull_request[:id].to_s,
        organization_id: @connector.organization_id,
        repository_id:   repository.id,
        project_id:      repository.project_id,
        tool_name:       "bitbucket",
        event_type:      "review",
        occurred_at:     Time.parse(pull_request[:updated_at] || Time.current.iso8601),
        metadata: {
          pullrequest_id: pull_request[:id],
          pr_title:       pull_request[:title],
          pr_state:       pull_request[:state],
          repository_id:  repository.id,
          author:         pull_request[:author_username],
          url:            pull_request[:web_url]
        }
      }
    end

    ToolEvents::BatchConnectorUpsert.call(unique_key: "pullrequest_id", records:)
  end

  def sync_pipelines_data(repository, pipelines)
    return if pipelines.empty?

    records = pipelines.map do |pipeline|
      {
        unique_value:    pipeline[:id].to_s,
        organization_id: @connector.organization_id,
        repository_id:   repository.id,
        project_id:      repository.project_id,
        tool_name:       "bitbucket",
        event_type:      "other",
        occurred_at:     Time.parse(pipeline[:updated_at] || Time.current.iso8601),
        metadata: {
          pipeline_id:   pipeline[:id],
          status:        pipeline[:status],
          ref:           pipeline[:ref],
          repository_id: repository.id,
          sha:           pipeline[:sha],
          url:           pipeline[:web_url]
        }
      }
    end

    ToolEvents::BatchConnectorUpsert.call(unique_key: "pipeline_id", records:)
  end

  def repository_coordinates(repository)
    repository.full_name.to_s.split("/", 2)
  end
end

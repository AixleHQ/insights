# frozen_string_literal: true

class GitlabSyncJob < ApplicationJob
  queue_as :connectors
  SYNC_WINDOW = 30.days

  def perform(connector_id, action = "sync", options = {})
    @connector = OrganizationConnector.find(connector_id)
    @options = options.symbolize_keys

    Rails.logger.info("[GitlabSyncJob] Starting #{action} for connector #{connector_id}")

    case action
    when "sync"
      fanout = sync_projects
      # When fan-out is active, mark_synced! is deferred to the last child job.
      return if fanout
    when "webhook"
      process_webhook
    else
      Rails.logger.warn("[GitlabSyncJob] Unknown action: #{action}")
    end

    @connector.mark_synced!
    Rails.logger.info("[GitlabSyncJob] Completed #{action} for connector #{connector_id}")
  rescue ActiveRecord::RecordNotFound
    Rails.logger.error("[GitlabSyncJob] Connector #{connector_id} not found")
  rescue Oauth::TokenRefreshError => e
    Rails.logger.error("[GitlabSyncJob] Token refresh failed for connector #{connector_id}: #{e.message}")
  rescue StandardError => e
    Rails.logger.error("[GitlabSyncJob] Failed: #{e.message}")
    raise
  end

  private

  # Returns true when fan-out mode is active (GITLAB_FANOUT=true env var).
  # In fan-out mode, one GitlabRepositoryActivitySyncJob is enqueued per repo;
  # mark_synced! is deferred to the last child via a counter on the connector.
  def sync_projects
    provider = Oauth::BaseProvider.for(@connector)
    projects = provider.fetch_repositories(all_pages: true)

    projects.each do |project_data|
      sync_project(project_data)
    end

    if fanout_enabled?
      enqueue_activity_jobs
      return true
    end

    sync_recent_activity(@connector)
    false
  end

  def fanout_enabled?
    ENV["GITLAB_FANOUT"].to_s.downcase == "true"
  end

  # Sets the pending counter and enqueues one child job per repository.
  # The counter is set atomically before any child starts so no race is possible.
  def enqueue_activity_jobs
    repo_ids = @connector.repositories.pluck(:id)
    return if repo_ids.empty?

    @connector.update_column(:pending_activity_jobs, repo_ids.size)
    Rails.logger.info("[GitlabSyncJob] Fan-out: enqueuing #{repo_ids.size} activity jobs for connector #{@connector.id}")

    repo_ids.each do |repo_id|
      GitlabRepositoryActivitySyncJob.perform_later(@connector.id, repo_id)
    end
  end

  def sync_project(project_data)
    repository = Repository.find_or_initialize_by(
      organization_connector: @connector,
      external_id: project_data[:external_id].to_s
    )

    repository.update!(
      name: project_data[:name],
      full_name: project_data[:full_name],
      url: project_data[:html_url],
      html_url: project_data[:html_url],
      clone_url: project_data[:clone_url],
      default_branch: project_data[:default_branch],
      is_private: project_data[:is_private],
      description: project_data[:description]
    )
  end

  def sync_recent_activity(connector)
    member_by_email = load_member_by_email

    connector.repositories.find_each do |repository|
      sync_repository_activity(repository, member_by_email)
      repository.mark_synced!
    end
  end

  # Fetches commits, MRs, and pipelines for a single repository in parallel.
  # Each fetch spawns its own GitlabProvider instance to avoid sharing the
  # memoized Faraday connection across threads.
  def sync_repository_activity(repository, member_by_email)
    commits_future = Concurrent::Promises.future do
      Oauth::GitlabProvider.new(@connector).fetch_commits(
        repository.external_id,
        ref_name: repository.default_branch,
        since: SYNC_WINDOW.ago
      )
    end

    mrs_future = Concurrent::Promises.future do
      Oauth::GitlabProvider.new(@connector).fetch_merge_requests(
        repository.external_id,
        updated_after: SYNC_WINDOW.ago
      )
    end

    pipelines_future = Concurrent::Promises.future do
      Oauth::GitlabProvider.new(@connector).fetch_pipelines(
        repository.external_id,
        updated_after: SYNC_WINDOW.ago
      )
    end

    commits   = commits_future.value!
    mrs       = mrs_future.value!
    pipelines = pipelines_future.value!

    commits.each { |commit| create_commit_event(repository, commit, member_by_email) }
    persist_merge_requests(repository, mrs)
    persist_pipelines(repository, pipelines)
  end

  def process_webhook
    event_type = @options[:event_type]
    payload = @options[:payload]

    case event_type
    when "Push Hook"
      process_push_event(payload)
    when "Merge Request Hook"
      process_merge_request_event(payload)
    when "Pipeline Hook"
      process_pipeline_event(payload)
    else
      Rails.logger.info("[GitlabSyncJob] Ignoring webhook event: #{event_type}")
    end
  end

  def process_push_event(payload)
    repository = find_repository(payload["project_id"])
    return unless repository

    commits = payload["commits"] || []
    return if commits.empty?

    member_by_email = load_member_by_email
    commits.each { |commit| create_commit_event(repository, commit, member_by_email) }
  end

  def process_merge_request_event(payload)
    repository = find_repository(payload.dig("project", "id"))
    return unless repository

    mr = payload["object_attributes"]

    ToolEvents::ConnectorUpsert.call(
      unique_key: "mr_iid",
      unique_value: mr["iid"],
      organization_id: @connector.organization_id,
      repository_id: repository.id,
      project_id: repository.project_id,
      tool_name: "gitlab",
      event_type: "review",
      occurred_at: Time.parse(mr["updated_at"]),
      metadata: {
        action: mr["action"],
        mr_iid: mr["iid"],
        mr_title: mr["title"],
        mr_state: mr["state"],
        repository_id: repository.id,
        author: payload.dig("user", "username"),
        url: mr["url"] || mr["last_commit"]&.dig("url")
      }
    )
  end

  def process_pipeline_event(payload)
    repository = find_repository(payload.dig("project", "id"))
    return unless repository

    pipeline = payload["object_attributes"]

    ToolEvents::ConnectorUpsert.call(
      unique_key: "pipeline_id",
      unique_value: pipeline["id"],
      organization_id: @connector.organization_id,
      repository_id: repository.id,
      project_id: repository.project_id,
      tool_name: "gitlab",
      event_type: "other",
      occurred_at: Time.parse(pipeline["created_at"] || pipeline["updated_at"]),
      metadata: {
        pipeline_id: pipeline["id"],
        status: pipeline["status"],
        ref: pipeline["ref"],
        repository_id: repository.id,
        duration: pipeline["duration"],
        sha: pipeline["sha"]
      }
    )
  end

  def find_repository(external_id)
    @connector.repositories.find_by(external_id: external_id.to_s)
  end

  def load_member_by_email
    @connector.organization.members.index_by { |m| m.email.downcase }
  end

  def create_commit_event(repository, commit, member_by_email = {})
    author_email = commit.dig("author", "email")&.downcase
    user = member_by_email[author_email] if author_email

    ToolEvents::ConnectorUpsert.call(
      unique_key: "sha",
      unique_value: commit["id"],
      organization_id: @connector.organization_id,
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

  def persist_merge_requests(repository, merge_requests)
    return if merge_requests.empty?

    records = merge_requests.map do |mr|
      {
        unique_value:    mr[:iid].to_s,
        organization_id: @connector.organization_id,
        repository_id:   repository.id,
        project_id:      repository.project_id,
        tool_name:       "gitlab",
        event_type:      "review",
        occurred_at:     Time.parse(mr[:updated_at]),
        metadata: {
          mr_iid:        mr[:iid],
          mr_title:      mr[:title],
          mr_state:      mr[:state],
          repository_id: repository.id,
          author:        mr[:author_username],
          url:           mr[:web_url]
        }
      }
    end

    ToolEvents::BatchConnectorUpsert.call(unique_key: "mr_iid", records:)
  end

  def persist_pipelines(repository, pipelines)
    return if pipelines.empty?

    records = pipelines.map do |pipeline|
      {
        unique_value:    pipeline[:id].to_s,
        organization_id: @connector.organization_id,
        repository_id:   repository.id,
        project_id:      repository.project_id,
        tool_name:       "gitlab",
        event_type:      "other",
        occurred_at:     Time.parse(pipeline[:updated_at]),
        metadata: {
          pipeline_id:   pipeline[:id],
          status:        pipeline[:status],
          ref:           pipeline[:ref],
          repository_id: repository.id,
          duration:      pipeline[:duration],
          sha:           pipeline[:sha],
          url:           pipeline[:web_url]
        }
      }
    end

    ToolEvents::BatchConnectorUpsert.call(unique_key: "pipeline_id", records:)
  end
end

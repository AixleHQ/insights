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
      sync_repositories
    when "refresh_token"
      refresh_token
    when "webhook"
      process_webhook
    else
      Rails.logger.warn("[BitbucketSyncJob] Unknown action: #{action}")
    end

    @connector.mark_synced!
    Rails.logger.info("[BitbucketSyncJob] Completed #{action} for connector #{connector_id}")
  rescue ActiveRecord::RecordNotFound
    Rails.logger.error("[BitbucketSyncJob] Connector #{connector_id} not found")
  rescue StandardError => e
    Rails.logger.error("[BitbucketSyncJob] Failed: #{e.message}")
    raise
  end

  private

  def sync_repositories
    provider = Oauth::BaseProvider.for(@connector)
    repos = provider.fetch_repositories

    repos.each do |repo_data|
      sync_repository(repo_data)
    end

    sync_recent_activity(provider)
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
    @connector.repositories.find_each do |repository|
      sync_commits(provider, repository)
      sync_pull_requests(provider, repository)
      sync_pipelines(provider, repository)
      repository.mark_synced!
    end
  end

  def refresh_token
    provider = Oauth::BaseProvider.for(@connector)
    token_data = provider.refresh_access_token

    @connector.update!(
      access_token: token_data[:access_token],
      refresh_token: token_data[:refresh_token],
      token_expires_at: token_data[:expires_at]
    )
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

    upsert_event!(
      unique_key: "pullrequest_id",
      unique_value: pr["id"],
      organization_id: @connector.organization_id,
      repository_id: repository.id,
      project_id: repository.project_id,
      tool_name: "bitbucket",
      event_type: "review",
      occurred_at: Time.parse(pr["updated_on"]),
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

    upsert_event!(
      unique_key: "pipeline_id",
      unique_value: pipeline_id,
      organization_id: @connector.organization_id,
      repository_id: repository.id,
      project_id: repository.project_id,
      tool_name: "bitbucket",
      event_type: "other",
      occurred_at: Time.parse(pipeline["completed_on"] || pipeline["created_on"]),
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
    author_email = commit.dig("author", "email") || extract_email(commit.dig("author", "raw"))
    user = member_by_email[author_email] if author_email

    upsert_event!(
      unique_key: "sha",
      unique_value: commit["hash"] || commit["id"],
      organization_id: @connector.organization_id,
      user_id: user&.id,
      repository_id: repository.id,
      project_id: repository.project_id,
      tool_name: "bitbucket",
      event_type: "commit",
      occurred_at: Time.parse(commit["date"] || commit["timestamp"]),
      metadata: {
        sha: commit["hash"] || commit["id"],
        message: commit["message"],
        author_name: commit.dig("author", "user", "display_name") || commit.dig("author", "name"),
        git_author_email: author_email
      }
    )
  end

  def sync_commits(provider, repository)
    workspace, repo_slug = repository_coordinates(repository)
    return if workspace.blank? || repo_slug.blank?

    commits = provider.fetch_commits(
      workspace,
      repo_slug,
      branch: repository.default_branch.presence || "main",
      since: SYNC_WINDOW.ago
    )
    return if commits.empty?

    member_by_email = load_member_by_email
    commits.each { |commit| create_commit_event(repository, commit, member_by_email) }
  end

  def sync_pull_requests(provider, repository)
    workspace, repo_slug = repository_coordinates(repository)
    return if workspace.blank? || repo_slug.blank?

    pull_requests = provider.fetch_pull_requests(
      workspace,
      repo_slug,
      updated_after: SYNC_WINDOW.ago
    )

    pull_requests.each do |pull_request|
      upsert_event!(
        unique_key: "pullrequest_id",
        unique_value: pull_request[:id],
        organization_id: @connector.organization_id,
        repository_id: repository.id,
        project_id: repository.project_id,
        tool_name: "bitbucket",
        event_type: "review",
        occurred_at: Time.parse(pull_request[:updated_at]),
        metadata: {
          pullrequest_id: pull_request[:id],
          pr_title: pull_request[:title],
          pr_state: pull_request[:state],
          repository_id: repository.id,
          author: pull_request[:author_username],
          url: pull_request[:web_url]
        }
      )
    end
  end

  def sync_pipelines(provider, repository)
    workspace, repo_slug = repository_coordinates(repository)
    return if workspace.blank? || repo_slug.blank?

    pipelines = provider.fetch_pipelines(
      workspace,
      repo_slug,
      updated_after: SYNC_WINDOW.ago
    )

    pipelines.each do |pipeline|
      upsert_event!(
        unique_key: "pipeline_id",
        unique_value: pipeline[:id],
        organization_id: @connector.organization_id,
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

  def extract_email(raw_author)
    return nil if raw_author.blank?

    match = raw_author.match(/<(.+)>/)
    match ? match[1].downcase : nil
  end

  def repository_coordinates(repository)
    repository.full_name.to_s.split("/", 2)
  end

  def upsert_event!(unique_key:, unique_value:, **attributes)
    existing_event = ToolEvent
      .where(
        organization_id: attributes[:organization_id],
        repository_id: attributes[:repository_id],
        tool_name: attributes[:tool_name],
        event_type: attributes[:event_type]
      )
      .where("metadata ->> ? = ?", unique_key.to_s, unique_value.to_s)
      .order(occurred_at: :desc)
      .first

    if existing_event
      existing_event.update!(attributes)
    else
      ToolEvent.create!(attributes)
    end
  end
end

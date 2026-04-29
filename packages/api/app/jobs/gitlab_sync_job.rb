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
      sync_projects
    when "refresh_token"
      refresh_token
    when "webhook"
      process_webhook
    else
      Rails.logger.warn("[GitlabSyncJob] Unknown action: #{action}")
    end

    @connector.mark_synced!
    Rails.logger.info("[GitlabSyncJob] Completed #{action} for connector #{connector_id}")
  rescue ActiveRecord::RecordNotFound
    Rails.logger.error("[GitlabSyncJob] Connector #{connector_id} not found")
  rescue StandardError => e
    Rails.logger.error("[GitlabSyncJob] Failed: #{e.message}")
    raise
  end

  private

  def sync_projects
    provider = Oauth::BaseProvider.for(@connector)
    projects = provider.fetch_repositories

    projects.each do |project_data|
      sync_project(project_data)
    end

    sync_recent_activity(provider)
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

  def sync_recent_activity(provider)
    @connector.repositories.find_each do |repository|
      sync_commits(provider, repository)
      sync_merge_requests(provider, repository)
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

    upsert_event!(
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

    upsert_event!(
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

    upsert_event!(
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

  def sync_commits(provider, repository)
    commits = provider.fetch_commits(
      repository.external_id,
      ref_name: repository.default_branch,
      since: SYNC_WINDOW.ago
    )

    return if commits.empty?

    member_by_email = load_member_by_email
    commits.each { |commit| create_commit_event(repository, commit, member_by_email) }
  end

  def sync_merge_requests(provider, repository)
    merge_requests = provider.fetch_merge_requests(
      repository.external_id,
      updated_after: SYNC_WINDOW.ago
    )

    merge_requests.each do |mr|
      upsert_event!(
        unique_key: "mr_iid",
        unique_value: mr[:iid],
        organization_id: @connector.organization_id,
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

  def sync_pipelines(provider, repository)
    pipelines = provider.fetch_pipelines(
      repository.external_id,
      updated_after: SYNC_WINDOW.ago
    )

    pipelines.each do |pipeline|
      upsert_event!(
        unique_key: "pipeline_id",
        unique_value: pipeline[:id],
        organization_id: @connector.organization_id,
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

# frozen_string_literal: true

class GitlabSyncJob
  include Sidekiq::Job

  sidekiq_options queue: "connectors", retry: 3

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
  end

  def sync_project(project_data)
    repository = @connector.repositories.find_or_initialize_by(
      external_id: project_data[:id].to_s
    )

    repository.update!(
      name: project_data[:name],
      full_name: project_data[:path_with_namespace],
      url: project_data[:web_url],
      default_branch: project_data[:default_branch],
      is_private: project_data[:visibility] == "private",
      metadata: {
        description: project_data[:description],
        namespace: project_data[:namespace],
        updated_at: project_data[:last_activity_at]
      }
    )
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
    commits.each do |commit|
      create_commit_event(repository, commit)
    end
  end

  def process_merge_request_event(payload)
    repository = find_repository(payload.dig("project", "id"))
    return unless repository

    mr = payload["object_attributes"]

    ToolEvent.create!(
      organization_id: @connector.organization_id,
      tool_name: "gitlab",
      event_type: "merge_request",
      occurred_at: Time.parse(mr["updated_at"]),
      metadata: {
        action: mr["action"],
        mr_iid: mr["iid"],
        mr_title: mr["title"],
        mr_state: mr["state"],
        repository_id: repository.id,
        author: payload.dig("user", "username")
      }
    )
  end

  def process_pipeline_event(payload)
    repository = find_repository(payload.dig("project", "id"))
    return unless repository

    pipeline = payload["object_attributes"]

    ToolEvent.create!(
      organization_id: @connector.organization_id,
      tool_name: "gitlab",
      event_type: "pipeline",
      occurred_at: Time.parse(pipeline["created_at"]),
      metadata: {
        pipeline_id: pipeline["id"],
        status: pipeline["status"],
        ref: pipeline["ref"],
        repository_id: repository.id,
        duration: pipeline["duration"]
      }
    )
  end

  def find_repository(external_id)
    @connector.repositories.find_by(external_id: external_id.to_s)
  end

  def create_commit_event(repository, commit)
    author_email = commit.dig("author", "email")&.downcase
    user = @connector.organization.members.find_by(email: author_email) if author_email

    ToolEvent.create!(
      organization_id: @connector.organization_id,
      user_id: user&.id,
      repository_id: repository.id,
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
end

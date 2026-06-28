# frozen_string_literal: true

class GithubSyncJob < ApplicationJob
  queue_as :connectors

  # Recent commits pulled from the GitHub API during connector sync (matches GitLab sync window).
  SYNC_WINDOW = 30.days

  retry_on StandardError, wait: :polynomially_longer, attempts: 3 do |job, error|
    opts = ApplicationJob.symbolized_job_options(job)
    WebhookDelivery.find_by(id: opts[:delivery_id])&.mark_failed!(error.message)
  end

  def perform(connector_id, action = "sync", options = {})
    @sync_started_at = (Time.current if action.to_s == "sync")
    @options   = options.symbolize_keys
    delivery   = action == "webhook" ? WebhookDelivery.find_by(id: @options[:delivery_id]) : nil
    delivery&.mark_processing!

    @connector = OrganizationConnector.find(connector_id)

    Rails.logger.info("[GithubSyncJob] Starting #{action} for connector #{connector_id}")

    case action
    when "sync"
      sync_repositories
    when "refresh_token"
      refresh_token
    when "webhook"
      process_webhook
    else
      Rails.logger.warn("[GithubSyncJob] Unknown action: #{action}")
    end

    delivery&.mark_delivered!
    @connector.mark_synced!(sync_started_at: @sync_started_at)
    Rails.logger.info("[GithubSyncJob] Completed #{action} for connector #{connector_id}")
  rescue ActiveRecord::RecordNotFound
    Rails.logger.error("[GithubSyncJob] Connector #{connector_id} not found")
    delivery&.mark_failed!("Connector not found")
  rescue StandardError => e
    @connector&.mark_error!(e.message, sync_started_at: @sync_started_at)
    Rails.logger.error("[GithubSyncJob] Failed: #{e.message}")
    delivery&.update!(last_error: e.message)
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
    repository = @connector.repositories.find_or_initialize_by(
      external_id: repo_data[:external_id].to_s
    )

    repository.update!(
      name:           repo_data[:name],
      full_name:      repo_data[:full_name],
      url:            repo_data[:html_url],
      html_url:       repo_data[:html_url],
      clone_url:      repo_data[:clone_url],
      default_branch: repo_data[:default_branch],
      is_private:     repo_data[:is_private],
      description:    repo_data[:description]
    )
  end

  def refresh_token
    provider = Oauth::BaseProvider.for(@connector)
    token_data = provider.refresh_access_token

    @connector.update!(
      access_token:     token_data[:access_token],
      refresh_token:    token_data[:refresh_token],
      token_expires_at: token_data[:expires_at]
    )
  end

  def process_webhook
    event_type = @options[:event_type]
    payload    = @options[:payload]

    case event_type
    when "push"
      process_push_event(payload)
    when "pull_request"
      process_pull_request_event(payload)
    when "installation", "installation_repositories"
      sync_repositories
    else
      Rails.logger.info("[GithubSyncJob] Ignoring webhook event: #{event_type}")
    end
  end

  def process_push_event(payload)
    repository = find_repository(payload.dig("repository", "id"))
    return unless repository

    commits = payload["commits"] || []
    return if commits.empty?

    member_by_email = load_member_by_email
    commits.each { |commit| create_commit_event(repository, commit, member_by_email) }
  end

  def process_pull_request_event(payload)
    repository = find_repository(payload.dig("repository", "id"))
    return unless repository

    pr     = payload["pull_request"]
    action = payload["action"]

    ToolEvent.create!(
      organization_id: @connector.organization_id,
      tool_name:       "github",
      event_type:      "review",
      occurred_at:     Time.parse(pr["updated_at"]),
      metadata: {
        action:        action,
        pr_number:     pr["number"],
        pr_title:      pr["title"],
        pr_state:      pr["state"],
        repository_id: repository.id,
        author:        pr.dig("user", "login")
      }
    )
  end

  def find_repository(external_id)
    @connector.repositories.find_by(external_id: external_id.to_s)
  end

  def load_member_by_email
    @connector.organization.members.index_by { |m| m.email.downcase }
  end

  # Backfills recent commits for repositories linked to a project. Push webhooks still drive
  # live updates; this makes history visible immediately after linking a repo (GitLab parity).
  def sync_recent_activity(provider)
    member_by_email = load_member_by_email

    @connector.repositories.where.not(project_id: nil).find_each do |repository|
      next if repository.full_name.blank?

      commits = provider.fetch_commits(
        repository.full_name,
        branch: repository.default_branch,
        since: self.class::SYNC_WINDOW.ago
      )

      commits.each do |commit|
        next if commit["timestamp"].blank?

        upsert_commit_event(repository, commit, member_by_email)
      end

      repository.mark_synced!
    end
  end

  def upsert_commit_event(repository, commit, member_by_email)
    author_email = commit.dig("author", "email")&.downcase
    user = member_by_email[author_email] if author_email

    ToolEvents::ConnectorUpsert.call(
      unique_key:       "sha",
      unique_value:     commit["id"],
      organization_id:  @connector.organization_id,
      user_id:          user&.id,
      repository_id:    repository.id,
      project_id:       repository.project_id,
      tool_name:        "github",
      event_type:       "commit",
      occurred_at:      Time.zone.parse(commit["timestamp"]),
      metadata:         {
        sha:              commit["id"],
        message:          commit["message"],
        author_name:      commit.dig("author", "name"),
        git_author_email: author_email,
        url:              commit["url"]
      }
    )
  end

  def create_commit_event(repository, commit, member_by_email = {})
    author_email = commit.dig("author", "email")&.downcase
    user = member_by_email[author_email] if author_email

    ToolEvent.create!(
      organization_id: @connector.organization_id,
      user_id:         user&.id,
      repository_id:   repository.id,
      project_id:      repository.project_id,
      tool_name:       "github",
      event_type:      "commit",
      occurred_at:     Time.parse(commit["timestamp"]),
      metadata: {
        sha:              commit["id"],
        message:          commit["message"],
        author_name:      commit.dig("author", "name"),
        git_author_email: author_email,
        url:              commit["url"]
      }
    )
  end
end

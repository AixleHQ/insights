# frozen_string_literal: true

class BitbucketSyncJob
  include Sidekiq::Job

  sidekiq_options queue: "connectors", retry: 3

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
  end

  def sync_repository(repo_data)
    repository = @connector.repositories.find_or_initialize_by(
      external_id: repo_data[:uuid]
    )

    repository.update!(
      name: repo_data[:name],
      full_name: repo_data[:full_name],
      url: repo_data.dig(:links, :html, :href),
      default_branch: repo_data.dig(:mainbranch, :name) || "main",
      is_private: repo_data[:is_private],
      metadata: {
        description: repo_data[:description],
        language: repo_data[:language],
        updated_on: repo_data[:updated_on]
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
    when "repo:push"
      process_push_event(payload)
    when "pullrequest:created", "pullrequest:updated", "pullrequest:fulfilled", "pullrequest:rejected"
      process_pull_request_event(payload, event_type)
    else
      Rails.logger.info("[BitbucketSyncJob] Ignoring webhook event: #{event_type}")
    end
  end

  def process_push_event(payload)
    repository = find_repository(payload.dig("repository", "uuid"))
    return unless repository

    push = payload["push"]
    changes = push["changes"] || []

    changes.each do |change|
      commits = change["commits"] || []
      commits.each do |commit|
        create_commit_event(repository, commit)
      end
    end
  end

  def process_pull_request_event(payload, event_type)
    repository = find_repository(payload.dig("repository", "uuid"))
    return unless repository

    pr = payload["pullrequest"]
    action = event_type.split(":").last

    ToolEvent.create!(
      organization_id: @connector.organization_id,
      tool_name: "bitbucket",
      event_type: "pull_request",
      occurred_at: Time.parse(pr["updated_on"]),
      metadata: {
        action: action,
        pr_id: pr["id"],
        pr_title: pr["title"],
        pr_state: pr["state"],
        repository_id: repository.id,
        author: pr.dig("author", "display_name")
      }
    )
  end

  def find_repository(external_id)
    @connector.repositories.find_by(external_id: external_id)
  end

  def create_commit_event(repository, commit)
    author_email = extract_email(commit.dig("author", "raw"))
    user = @connector.organization.members.find_by(email: author_email) if author_email

    ToolEvent.create!(
      organization_id: @connector.organization_id,
      user_id: user&.id,
      repository_id: repository.id,
      project_id: repository.project_id,
      tool_name: "bitbucket",
      event_type: "commit",
      occurred_at: Time.parse(commit["date"]),
      metadata: {
        sha: commit["hash"],
        message: commit["message"],
        author_name: commit.dig("author", "user", "display_name"),
        git_author_email: author_email
      }
    )
  end

  def extract_email(raw_author)
    return nil if raw_author.blank?
    match = raw_author.match(/<(.+)>/)
    match ? match[1].downcase : nil
  end
end

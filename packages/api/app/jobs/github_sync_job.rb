# frozen_string_literal: true

class GithubSyncJob
  include Sidekiq::Job

  sidekiq_options queue: 'connectors', retry: 3

  def perform(connector_id, action = 'sync', options = {})
    @connector = OrganizationConnector.find(connector_id)
    @options = options.symbolize_keys

    Rails.logger.info("[GithubSyncJob] Starting #{action} for connector #{connector_id}")

    case action
    when 'sync'
      sync_repositories
    when 'refresh_token'
      refresh_token
    when 'webhook'
      process_webhook
    else
      Rails.logger.warn("[GithubSyncJob] Unknown action: #{action}")
    end

    @connector.mark_synced!
    Rails.logger.info("[GithubSyncJob] Completed #{action} for connector #{connector_id}")
  rescue ActiveRecord::RecordNotFound
    Rails.logger.error("[GithubSyncJob] Connector #{connector_id} not found")
  rescue StandardError => e
    Rails.logger.error("[GithubSyncJob] Failed: #{e.message}")
    raise
  end

  private

  def sync_repositories
    provider = Oauth::BaseProvider.for(@connector)
    repos = provider.list_repositories

    repos.each do |repo_data|
      sync_repository(repo_data)
    end
  end

  def sync_repository(repo_data)
    repository = @connector.repositories.find_or_initialize_by(
      external_id: repo_data[:id].to_s
    )

    repository.update!(
      name: repo_data[:name],
      full_name: repo_data[:full_name],
      url: repo_data[:html_url],
      default_branch: repo_data[:default_branch],
      is_private: repo_data[:private],
      metadata: {
        language: repo_data[:language],
        description: repo_data[:description],
        updated_at: repo_data[:updated_at]
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
    when 'push'
      process_push_event(payload)
    when 'pull_request'
      process_pull_request_event(payload)
    when 'installation', 'installation_repositories'
      sync_repositories
    else
      Rails.logger.info("[GithubSyncJob] Ignoring webhook event: #{event_type}")
    end
  end

  def process_push_event(payload)
    repository = find_repository(payload.dig('repository', 'id'))
    return unless repository

    commits = payload['commits'] || []
    commits.each do |commit|
      create_commit_event(repository, commit)
    end
  end

  def process_pull_request_event(payload)
    repository = find_repository(payload.dig('repository', 'id'))
    return unless repository

    pr = payload['pull_request']
    action = payload['action']

    ToolEvent.create!(
      organization_id: @connector.organization_id,
      tool_name: 'github',
      event_type: 'pull_request',
      occurred_at: Time.parse(pr['updated_at']),
      metadata: {
        action: action,
        pr_number: pr['number'],
        pr_title: pr['title'],
        pr_state: pr['state'],
        repository_id: repository.id,
        author: pr.dig('user', 'login')
      }
    )
  end

  def find_repository(external_id)
    @connector.repositories.find_by(external_id: external_id.to_s)
  end

  def create_commit_event(repository, commit)
    ToolEvent.create!(
      organization_id: @connector.organization_id,
      tool_name: 'github',
      event_type: 'commit',
      occurred_at: Time.parse(commit['timestamp']),
      metadata: {
        sha: commit['id'],
        message: commit['message'],
        author_name: commit.dig('author', 'name'),
        author_email: commit.dig('author', 'email'),
        repository_id: repository.id,
        url: commit['url']
      }
    )
  end
end

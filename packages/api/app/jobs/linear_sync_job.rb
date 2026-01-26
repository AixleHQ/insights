# frozen_string_literal: true

class LinearSyncJob
  include Sidekiq::Job

  sidekiq_options queue: 'connectors', retry: 3

  def perform(connector_id, action = 'sync', options = {})
    @connector = OrganizationConnector.find(connector_id)
    @options = options.symbolize_keys

    Rails.logger.info("[LinearSyncJob] Starting #{action} for connector #{connector_id}")

    case action
    when 'sync'
      sync_teams
    when 'refresh_token'
      refresh_token
    when 'webhook'
      process_webhook
    else
      Rails.logger.warn("[LinearSyncJob] Unknown action: #{action}")
    end

    @connector.mark_synced!
    Rails.logger.info("[LinearSyncJob] Completed #{action} for connector #{connector_id}")
  rescue ActiveRecord::RecordNotFound
    Rails.logger.error("[LinearSyncJob] Connector #{connector_id} not found")
  rescue StandardError => e
    Rails.logger.error("[LinearSyncJob] Failed: #{e.message}")
    raise
  end

  private

  def sync_teams
    provider = Oauth::BaseProvider.for(@connector)
    teams = provider.list_teams

    @connector.metadata ||= {}
    @connector.metadata['teams'] = teams.map do |team|
      {
        id: team[:id],
        name: team[:name],
        key: team[:key]
      }
    end
    @connector.save!
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

    entity_type = payload['type']
    action = payload['action']

    case entity_type
    when 'Issue'
      process_issue_event(payload, action)
    when 'Comment'
      process_comment_event(payload, action)
    when 'Project'
      process_project_event(payload, action)
    when 'Cycle'
      process_cycle_event(payload, action)
    else
      Rails.logger.info("[LinearSyncJob] Ignoring webhook event: #{entity_type}/#{action}")
    end
  end

  def process_issue_event(payload, action)
    data = payload['data']
    return unless data

    ToolEvent.create!(
      organization_id: @connector.organization_id,
      tool_name: 'linear',
      event_type: 'issue',
      occurred_at: Time.parse(payload['createdAt']),
      metadata: {
        action: action,
        issue_id: data['id'],
        issue_identifier: data['identifier'],
        title: data['title'],
        state: data.dig('state', 'name'),
        priority: data['priority'],
        team_id: data.dig('team', 'id'),
        team_name: data.dig('team', 'name'),
        assignee_id: data.dig('assignee', 'id'),
        assignee_name: data.dig('assignee', 'name'),
        creator_id: data.dig('creator', 'id'),
        creator_name: data.dig('creator', 'name'),
        labels: extract_labels(data)
      }
    )
  end

  def process_comment_event(payload, action)
    data = payload['data']
    return unless data

    ToolEvent.create!(
      organization_id: @connector.organization_id,
      tool_name: 'linear',
      event_type: 'comment',
      occurred_at: Time.parse(payload['createdAt']),
      metadata: {
        action: action,
        comment_id: data['id'],
        issue_id: data.dig('issue', 'id'),
        issue_identifier: data.dig('issue', 'identifier'),
        user_id: data.dig('user', 'id'),
        user_name: data.dig('user', 'name')
      }
    )
  end

  def process_project_event(payload, action)
    data = payload['data']
    return unless data

    ToolEvent.create!(
      organization_id: @connector.organization_id,
      tool_name: 'linear',
      event_type: 'project',
      occurred_at: Time.parse(payload['createdAt']),
      metadata: {
        action: action,
        project_id: data['id'],
        project_name: data['name'],
        state: data['state'],
        progress: data['progress'],
        team_ids: data['teamIds']
      }
    )
  end

  def process_cycle_event(payload, action)
    data = payload['data']
    return unless data

    ToolEvent.create!(
      organization_id: @connector.organization_id,
      tool_name: 'linear',
      event_type: 'cycle',
      occurred_at: Time.parse(payload['createdAt']),
      metadata: {
        action: action,
        cycle_id: data['id'],
        cycle_name: data['name'],
        cycle_number: data['number'],
        starts_at: data['startsAt'],
        ends_at: data['endsAt'],
        team_id: data.dig('team', 'id'),
        team_name: data.dig('team', 'name')
      }
    )
  end

  def extract_labels(data)
    labels = data['labels'] || []
    labels.map { |l| { id: l['id'], name: l['name'] } }
  end
end

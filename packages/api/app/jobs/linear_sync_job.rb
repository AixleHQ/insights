# frozen_string_literal: true

class LinearSyncJob < ApplicationJob
  queue_as :connectors
  retry_on StandardError, wait: :polynomially_longer, attempts: 3
  retry_on Oauth::LinearApiError, wait: :polynomially_longer, attempts: 5

  SYNC_WINDOW = 30.days

  sidekiq_retries_exhausted do |msg, ex|
    opts = (msg["args"][2] || {}).transform_keys(&:to_sym)
    WebhookDelivery.find_by(id: opts[:delivery_id])&.mark_failed!(ex.message)
  end

  def perform(connector_id, action = "sync", options = {})
    @options   = options.symbolize_keys
    delivery   = action == "webhook" ? WebhookDelivery.find_by(id: @options[:delivery_id]) : nil
    delivery&.mark_processing!

    @connector = OrganizationConnector.find(connector_id)

    Rails.logger.info("[LinearSyncJob] Starting #{action} for connector #{connector_id}")

    case action
    when "sync"
      ensure_valid_token!
      sync_resources
      sync_recent_activity
      if @options[:project_id]
        sync_single_project_issues(@options[:project_id])
      else
        sync_all_linked_project_issues
      end
    when "refresh_token"
      refresh_token
    when "webhook"
      process_webhook
    else
      Rails.logger.warn("[LinearSyncJob] Unknown action: #{action}")
    end

    delivery&.mark_delivered!
    @connector.mark_synced!
    Rails.logger.info("[LinearSyncJob] Completed #{action} for connector #{connector_id}")
  rescue ActiveRecord::RecordNotFound
    Rails.logger.error("[LinearSyncJob] Connector #{connector_id} not found")
    delivery&.mark_failed!("Connector not found")
  rescue StandardError => e
    @connector&.mark_error!(e.message)
    Rails.logger.error("[LinearSyncJob] Failed: #{e.message}")
    delivery&.update!(last_error: e.message)
    raise
  end

  private

  def provider
    @provider ||= Oauth::BaseProvider.for(@connector)
  end

  def sync_resources
    teams = provider.fetch_teams
    projects = provider.fetch_projects
    cycles = provider.fetch_cycles

    @connector.config ||= {}
    @connector.config["teams"] = teams.index_by { |team| team[:external_id] }
    @connector.config["projects"] = projects.index_by { |project| project[:external_id] }
    @connector.config["cycles"] = cycles.index_by { |cycle| cycle[:external_id] }
    @connector.save!
  end

  def sync_recent_activity
    issues = provider.fetch_issues(updated_after: SYNC_WINDOW.ago)
    batch_upsert_snapshots(issues)
  end

  def sync_single_project_issues(project_id)
    project = Project.find(project_id)
    linear_project_id = project.project_settings.find_by(key: "linear_project_id")&.value
    sync_project_issues(project, linear_project_id) if linear_project_id.present?
  end

  def sync_all_linked_project_issues
    linked_connector_project_ids = ProjectSetting.where(key: "linear_connector_id", value: @connector.id.to_s).select(:project_id)
    ProjectSetting.where(key: "linear_project_id", project_id: linked_connector_project_ids)
                  .includes(:project)
                  .each do |setting|
      sync_project_issues(setting.project, setting.value) if setting.value.present?
    end
  end

  def sync_project_issues(project, linear_project_id)
    issues = provider.fetch_issues(project_ids: [ linear_project_id ])
    upsert_issues(issues, project)
  end

  def refresh_token
    provider.refresh_token!
  end

  def process_webhook
    payload = @options[:payload]

    entity_type = payload["type"]
    action      = payload["action"]

    case entity_type
    when "Issue"
      process_issue_event(payload, action)
    when "Comment"
      process_comment_event(payload, action)
    when "Project"
      process_project_event(payload, action)
    when "Cycle"
      process_cycle_event(payload, action)
    else
      Rails.logger.info("[LinearSyncJob] Ignoring webhook event: #{entity_type}/#{action}")
    end
  end

  def process_issue_event(payload, action)
    data = payload["data"]
    return unless data

    issue = map_issue_payload(data)
    user = resolve_issue_user(issue)
    metadata = issue_metadata(issue).merge(action: normalized_issue_action(action, payload))

    if state_change_payload?(payload)
      metadata[:from_state_id] = payload.dig("updatedFrom", "stateId")
      metadata[:from_state_name] = payload.dig("updatedFrom", "stateName")
      metadata[:from_state_type] = payload.dig("updatedFrom", "stateType")
      metadata[:to_state_id] = issue[:state_id]
      metadata[:to_state_name] = issue[:state_name]
      metadata[:to_state_type] = issue[:state_type]
    end

    upsert_event!(
      unique_key: "issue_event_key",
      unique_value: "#{issue[:external_id]}:#{metadata[:action]}:#{payload['createdAt'] || issue[:updated_at]}",
      organization_id: @connector.organization_id,
      user_id: user&.id,
      tool_name: "linear",
      event_type: "issue",
      occurred_at: parse_time(payload["createdAt"]) || parse_time(issue[:updated_at]) || Time.current,
      metadata: metadata
    )

    create_or_update_issue_snapshot(issue)
    resolve_projects_for_linear_project(issue[:project_id]).each do |project|
      upsert_issues([ issue ], project)
    end
  end

  def process_comment_event(payload, action)
    data = payload["data"]
    return unless data

    user = resolve_user_by_email(data.dig("user", "email"))

    upsert_event!(
      unique_key: "comment_id",
      unique_value: data["id"],
      organization_id: @connector.organization_id,
      user_id: user&.id,
      tool_name: "linear",
      event_type: "comment",
      occurred_at: parse_time(payload["createdAt"]) || Time.current,
      metadata: {
        action:           action,
        comment_id:       data["id"],
        issue_id:         data.dig("issue", "id"),
        issue_identifier: data.dig("issue", "identifier"),
        user_id:          data.dig("user", "id"),
        user_name:        data.dig("user", "name")
      }
    )
  end

  def process_project_event(payload, action)
    data = payload["data"]
    return unless data

    upsert_event!(
      unique_key: "linear_project_event_key",
      unique_value: "#{data['id']}:#{action}:#{payload['createdAt'] || data['updatedAt']}",
      organization_id: @connector.organization_id,
      tool_name: "linear",
      event_type: "other",
      occurred_at: parse_time(payload["createdAt"]) || Time.current,
      metadata: {
        action:       action,
        project_id:   data["id"],
        project_name: data["name"],
        state:        data["state"],
        progress:     data["progress"],
        team_ids:     data["teamIds"]
      }
    )
  end

  def process_cycle_event(payload, action)
    data = payload["data"]
    return unless data

    upsert_event!(
      unique_key: "cycle_id",
      unique_value: data["id"],
      organization_id: @connector.organization_id,
      tool_name: "linear",
      event_type: "sprint",
      occurred_at: parse_time(payload["createdAt"]) || parse_time(data["updatedAt"]) || Time.current,
      metadata: {
        action:        action,
        cycle_id:      data["id"],
        cycle_name:    data["name"],
        cycle_number:  data["number"],
        starts_at:     data["startsAt"],
        ends_at:       data["endsAt"],
        team_id:       data.dig("team", "id"),
        team_name:     data.dig("team", "name")
      }
    )
  end

  def batch_upsert_snapshots(issues)
    return if issues.empty?

    records = issues.map do |issue|
      user = resolve_issue_user(issue)
      {
        unique_value:    issue[:external_id],
        organization_id: @connector.organization_id,
        user_id:         user&.id,
        tool_name:       "linear",
        event_type:      "issue",
        occurred_at:     parse_time(issue[:updated_at]) || parse_time(issue[:created_at]) || Time.current,
        metadata:        issue_metadata(issue).merge(action: "synced", issue_snapshot_id: issue[:external_id])
      }
    end

    ToolEvents::BatchConnectorUpsert.call(unique_key: "issue_snapshot_id", records:)
  end

  def create_or_update_issue_snapshot(issue)
    user = resolve_issue_user(issue)

    upsert_event!(
      unique_key: "issue_snapshot_id",
      unique_value: issue[:external_id],
      organization_id: @connector.organization_id,
      user_id: user&.id,
      tool_name: "linear",
      event_type: "issue",
      occurred_at: parse_time(issue[:updated_at]) || parse_time(issue[:created_at]) || Time.current,
      metadata: issue_metadata(issue).merge(action: "synced")
    )
  end

  def upsert_issues(issues_data, project)
    return if issues_data.empty?

    now = Time.current
    rows = issues_data.map do |issue|
      user = resolve_issue_user(issue)
      {
        id: SecureRandom.uuid,
        organization_id: @connector.organization_id,
        project_id: project.id,
        organization_connector_id: @connector.id,
        assignee_id: user&.id,
        external_id: issue[:external_id],
        key: issue[:identifier],
        summary: issue[:title],
        description: nil,
        status: issue[:state_name],
        status_category: map_status_category(issue[:state_type]),
        issue_type: "Issue",
        priority: issue[:priority]&.to_s,
        provider_project_key: issue[:team_key].presence || issue[:project_name].presence || "LINEAR",
        provider_project_id: issue[:project_id].presence || issue[:team_id].presence || issue[:external_id],
        assignee_account_id: issue[:assignee_id],
        assignee_name: issue[:assignee_name],
        reporter_name: issue[:creator_name],
        parent_key: nil,
        labels: [], # TODO: fetch and map Linear labels (issue[:label_ids] via labelsForIssue query)
        due_date: nil,
        metadata: {
          provider: "linear",
          linear_project_id: issue[:project_id],
          linear_project_name: issue[:project_name],
          cycle_id: issue[:cycle_id],
          cycle_name: issue[:cycle_name],
          cycle_number: issue[:cycle_number],
          state_id: issue[:state_id],
          state_type: issue[:state_type]
        },
        external_created_at: parse_time(issue[:created_at]),
        external_updated_at: parse_time(issue[:updated_at]),
        synced_at: now,
        created_at: now,
        updated_at: now
      }
    end

    Issue.upsert_all(
      rows,
      unique_by: %i[organization_connector_id project_id external_id],
      update_only: %i[
        assignee_id key summary status status_category issue_type priority
        provider_project_key provider_project_id assignee_account_id assignee_name reporter_name
        metadata external_created_at external_updated_at synced_at updated_at
      ],
      record_timestamps: false
    )
  end

  def issue_metadata(issue)
    {
      issue_id: issue[:external_id],
      issue_identifier: issue[:identifier],
      title: issue[:title],
      priority: issue[:priority],
      created_at: issue[:created_at],
      updated_at: issue[:updated_at],
      completed_at: issue[:completed_at],
      canceled_at: issue[:canceled_at],
      state_id: issue[:state_id],
      state_name: issue[:state_name],
      state_type: issue[:state_type],
      team_id: issue[:team_id],
      team_name: issue[:team_name],
      team_key: issue[:team_key],
      linear_project_id: issue[:project_id],
      linear_project_name: issue[:project_name],
      cycle_id: issue[:cycle_id],
      cycle_name: issue[:cycle_name],
      cycle_number: issue[:cycle_number],
      assignee_id: issue[:assignee_id],
      assignee_name: issue[:assignee_name],
      assignee_email: issue[:assignee_email],
      creator_id: issue[:creator_id],
      creator_name: issue[:creator_name],
      creator_email: issue[:creator_email]
    }
  end

  def resolve_issue_user(issue)
    resolve_user_by_email(issue[:assignee_email]) || resolve_user_by_email(issue[:creator_email])
  end

  def resolve_projects_for_linear_project(linear_project_id)
    return [] if linear_project_id.blank?

    ProjectSetting.joins(:project)
      .where(key: "linear_project_id", value: linear_project_id)
      .where(projects: { organization_id: @connector.organization_id })
      .map(&:project)
  end

  def resolve_user_by_email(email)
    return nil if email.blank?

    @members_by_email ||= @connector.organization.members.index_by { |member| member.email.downcase }
    @members_by_email[email.downcase]
  end

  def ensure_valid_token!
    # nil means the provider didn't return expires_in → refresh defensively
    return if @connector.token_expires_at && @connector.token_expires_at > 5.minutes.from_now

    provider.refresh_token!
  end

  def normalized_issue_action(action, payload)
    return "state_changed" if state_change_payload?(payload)

    action
  end

  def state_change_payload?(payload)
    payload.dig("updatedFrom", "stateId").present? || payload.dig("updatedFrom", "stateName").present?
  end

  def map_issue_payload(data)
    {
      external_id: data["id"],
      identifier: data["identifier"],
      title: data["title"],
      priority: data["priority"],
      created_at: data["createdAt"],
      updated_at: data["updatedAt"],
      completed_at: data["completedAt"],
      canceled_at: data["canceledAt"],
      state_id: data.dig("state", "id"),
      state_name: data.dig("state", "name"),
      state_type: data.dig("state", "type"),
      team_id: data.dig("team", "id"),
      team_name: data.dig("team", "name"),
      team_key: data.dig("team", "key"),
      project_id: data.dig("project", "id"),
      project_name: data.dig("project", "name"),
      cycle_id: data.dig("cycle", "id"),
      cycle_name: data.dig("cycle", "name"),
      cycle_number: data.dig("cycle", "number"),
      assignee_id: data.dig("assignee", "id"),
      assignee_name: data.dig("assignee", "name"),
      assignee_email: data.dig("assignee", "email"),
      creator_id: data.dig("creator", "id"),
      creator_name: data.dig("creator", "name"),
      creator_email: data.dig("creator", "email")
    }
  end

  def parse_time(value)
    return nil if value.blank?

    Time.zone.parse(value.to_s)
  rescue ArgumentError
    nil
  end

  def map_status_category(state_type)
    case state_type.to_s
    when "completed", "canceled"
      "done"
    when "started"
      "indeterminate"
    else
      "new"
    end
  end

  def upsert_event!(unique_key:, unique_value:, **attributes)
    metadata = attributes[:metadata] || {}
    attributes[:metadata] = metadata.merge(unique_key.to_s => unique_value.to_s)

    ToolEvents::ConnectorUpsert.call(
      unique_key: unique_key,
      unique_value: unique_value,
      **attributes
    )
  end
end

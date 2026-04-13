# frozen_string_literal: true

class JiraSyncJob
  include Sidekiq::Job

  sidekiq_options queue: "connectors", retry: 3

  def perform(connector_id, action = "sync", options = {})
    @connector = OrganizationConnector.find(connector_id)
    @options = options.symbolize_keys

    Rails.logger.info("[JiraSyncJob] Starting #{action} for connector #{connector_id}")

    case action
    when "sync"
      sync_projects
      sync_all_issues
    when "refresh_token"
      refresh_token
    when "webhook"
      process_webhook
    else
      Rails.logger.warn("[JiraSyncJob] Unknown action: #{action}")
    end

    @connector.mark_synced!
    Rails.logger.info("[JiraSyncJob] Completed #{action} for connector #{connector_id}")
  rescue ActiveRecord::RecordNotFound
    Rails.logger.error("[JiraSyncJob] Connector #{connector_id} not found")
  rescue StandardError => e
    Rails.logger.error("[JiraSyncJob] Failed: #{e.message}")
    raise
  end

  private

  def sync_projects
    provider = Oauth::BaseProvider.for(@connector)
    projects = provider.fetch_projects

    projects.each do |project_data|
      sync_project(project_data)
    end
  end

  def sync_all_issues
    linked_connector_project_ids = ProjectSetting.where(key: "jira_connector_id", value: @connector.id.to_s).select(:project_id)
    ProjectSetting.where(key: "jira_project_key", project_id: linked_connector_project_ids)
                  .includes(:project)
                  .each do |setting|
      sync_project_issues(setting.project, setting.value) if setting.value.present?
    end
  end

  def sync_project_issues(project, jira_key)
    provider = Oauth::BaseProvider.for(@connector)
    start_at = 0
    loop do
      result = provider.fetch_issues(jira_key, start_at: start_at)
      upsert_issues(result[:issues], project)
      start_at += result[:issues].size
      break if start_at >= result[:total] || result[:issues].empty?
    end
  end

  def upsert_issues(issues_data, project)
    org = @connector.organization
    issues_data.each do |attrs|
      issue = Issue.find_or_initialize_by(
        organization_connector: @connector,
        external_id: attrs[:external_id]
      )
      issue.update!(attrs.merge(organization: org, project: project, synced_at: Time.current))
    end
  end

  def resolve_project_for_key(jira_project_key)
    ProjectSetting.joins(:project)
      .where(key: "jira_project_key", value: jira_project_key)
      .where(projects: { organization_id: @connector.organization_id })
      .first&.project
  end

  def sync_project(project_data)
    @connector.metadata ||= {}
    @connector.metadata["projects"] ||= {}
    @connector.metadata["projects"][project_data[:key]] = {
      id: project_data[:id],
      name: project_data[:name],
      key: project_data[:key],
      project_type: project_data[:projectTypeKey]
    }
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

    case event_type
    when "jira:issue_created", "jira:issue_updated"
      process_issue_event(payload, event_type)
    when "comment_created", "comment_updated"
      process_comment_event(payload, event_type)
    when "sprint_started", "sprint_closed"
      process_sprint_event(payload, event_type)
    else
      Rails.logger.info("[JiraSyncJob] Ignoring webhook event: #{event_type}")
    end
  end

  def process_issue_event(payload, event_type)
    issue_data = payload["issue"]
    return unless issue_data

    action = event_type.split(":").last.gsub("issue_", "")

    ToolEvent.create!(
      organization_id: @connector.organization_id,
      tool_name: "jira",
      event_type: "issue",
      occurred_at: Time.current,
      metadata: {
        action: action,
        issue_key: issue_data["key"],
        issue_id: issue_data["id"],
        summary: issue_data.dig("fields", "summary"),
        status: issue_data.dig("fields", "status", "name"),
        issue_type: issue_data.dig("fields", "issuetype", "name"),
        project_key: issue_data.dig("fields", "project", "key"),
        assignee: issue_data.dig("fields", "assignee", "displayName"),
        reporter: issue_data.dig("fields", "reporter", "displayName"),
        changelog: extract_changelog(payload)
      }
    )

    provider = Oauth::BaseProvider.for(@connector)
    attrs = provider.map_issue(issue_data)
    upsert_issues([ attrs ], resolve_project_for_key(attrs[:jira_project_key]))
  end

  def process_comment_event(payload, event_type)
    comment = payload["comment"]
    issue = payload["issue"]
    return unless comment && issue

    action = event_type.gsub("comment_", "")

    ToolEvent.create!(
      organization_id: @connector.organization_id,
      tool_name: "jira",
      event_type: "comment",
      occurred_at: Time.parse(comment["created"]),
      metadata: {
        action: action,
        comment_id: comment["id"],
        issue_key: issue["key"],
        author: comment.dig("author", "displayName")
      }
    )
  end

  def process_sprint_event(payload, event_type)
    sprint = payload["sprint"]
    return unless sprint

    action = event_type.gsub("sprint_", "")

    ToolEvent.create!(
      organization_id: @connector.organization_id,
      tool_name: "jira",
      event_type: "sprint",
      occurred_at: Time.current,
      metadata: {
        action: action,
        sprint_id: sprint["id"],
        sprint_name: sprint["name"],
        sprint_state: sprint["state"],
        board_id: sprint["originBoardId"]
      }
    )
  end

  def extract_changelog(payload)
    changelog = payload["changelog"]
    return nil unless changelog

    items = changelog["items"] || []
    items.map do |item|
      {
        field: item["field"],
        from: item["fromString"],
        to: item["toString"]
      }
    end
  end
end

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
    projects = provider.list_projects

    projects.each do |project_data|
      sync_project(project_data)
    end
  end

  def sync_project(project_data)
    # Store project info in connector metadata
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
    issue = payload["issue"]
    return unless issue

    action = event_type.split(":").last.gsub("issue_", "")

    ToolEvent.create!(
      organization_id: @connector.organization_id,
      tool_name: "jira",
      event_type: "issue",
      occurred_at: Time.current,
      metadata: {
        action: action,
        issue_key: issue["key"],
        issue_id: issue["id"],
        summary: issue.dig("fields", "summary"),
        status: issue.dig("fields", "status", "name"),
        issue_type: issue.dig("fields", "issuetype", "name"),
        project_key: issue.dig("fields", "project", "key"),
        assignee: issue.dig("fields", "assignee", "displayName"),
        reporter: issue.dig("fields", "reporter", "displayName"),
        changelog: extract_changelog(payload)
      }
    )
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

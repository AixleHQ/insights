# frozen_string_literal: true

class JiraSyncJob < ApplicationJob
  queue_as :connectors

  retry_on StandardError, wait: :polynomially_longer, attempts: 3 do |job, error|
    opts = ApplicationJob.symbolized_job_options(job)
    WebhookDelivery.find_by(id: opts[:delivery_id])&.mark_failed!(error.message)
  end

  def perform(connector_id, action = "sync", options = {})
    @options   = options.symbolize_keys
    delivery   = action == "webhook" ? WebhookDelivery.find_by(id: @options[:delivery_id]) : nil
    delivery&.mark_processing!

    @connector = OrganizationConnector.find(connector_id)

    Rails.logger.info("[JiraSyncJob] Starting #{action} for connector #{connector_id}")

    case action
    when "sync"
      ensure_valid_token!
      sync_projects
      if @options[:project_id]
        sync_single_project(@options[:project_id])
      else
        sync_all_issues
      end
      @connector.mark_synced!
    when "refresh_token"
      refresh_token
    when "webhook"
      process_webhook
    else
      Rails.logger.warn("[JiraSyncJob] Unknown action: #{action}")
    end

    delivery&.mark_delivered!
    Rails.logger.info("[JiraSyncJob] Completed #{action} for connector #{connector_id}")
  rescue ActiveRecord::RecordNotFound
    Rails.logger.error("[JiraSyncJob] Connector #{connector_id} not found")
    delivery&.mark_failed!("Connector not found")
  rescue StandardError => e
    Rails.logger.error("[JiraSyncJob] Failed: #{e.message}")
    delivery&.update!(last_error: e.message)
    raise
  end

  private

  # Memoized provider — reuses a single Faraday connection for the entire job.
  def provider
    @provider ||= Oauth::BaseProvider.for(@connector)
  end

  def sync_projects
    projects = provider.fetch_projects
    return if projects.empty?

    # Store available Jira projects in connector config for reference.
    @connector.config ||= {}
    @connector.config["projects"] ||= {}
    projects.each do |project_data|
      @connector.config["projects"][project_data[:key]] = {
        id:           project_data[:id],
        name:         project_data[:name],
        key:          project_data[:key],
        project_type: project_data[:projectTypeKey]
      }
    end
    @connector.save!
  end

  def sync_single_project(project_id)
    project  = Project.find(project_id)
    jira_key = project.project_settings.find_by(key: "jira_project_key")&.value
    sync_project_issues(project, jira_key) if jira_key.present?
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
    next_page_token = nil
    loop do
      result = provider.fetch_issues(jira_key, next_page_token: next_page_token)
      upsert_issues(result[:issues], project)
      next_page_token = result[:next_page_token]
      break if next_page_token.nil? || result[:issues].empty?
    end
  end

  # Bulk-upserts issues using a single INSERT ... ON CONFLICT statement.
  # This avoids N+1 UPDATE queries (one per issue) and is safe to call
  # repeatedly — re-syncing the same external_id simply updates the row.
  def upsert_issues(issues_data, project)
    return if issues_data.empty?

    org = @connector.organization
    now = Time.current

    rows = issues_data.map do |attrs|
      assignee = resolve_assignee(org, attrs[:assignee_account_id])
      attrs.except(:assignee_account_id).merge(
        id:                        SecureRandom.uuid,
        organization_id:           org.id,
        organization_connector_id: @connector.id,
        project_id:                project.id,
        assignee_id:               assignee&.id,
        synced_at:                 now,
        created_at:                now,
        updated_at:                now
      )
    end

    Issue.upsert_all(
      rows,
      unique_by: %i[organization_connector_id project_id external_id],
      update_only: %i[
        summary status status_category issue_type priority
        assignee_id assignee_name reporter_name provider_project_key provider_project_id
        parent_key labels due_date external_created_at external_updated_at
        synced_at updated_at
      ],
      record_timestamps: false
    )
  end

  def resolve_assignee(org, account_id)
    return nil if account_id.blank?

    @assignee_cache ||= {}
    unless @assignee_cache.key?(account_id)
      email = provider.fetch_user_email(account_id)
      @assignee_cache[account_id] = email ? org.users.find_by(email: email) : nil
    end
    @assignee_cache[account_id]
  end

  def resolve_project_for_key(jira_project_key)
    ProjectSetting.joins(:project)
      .where(key: "jira_project_key", value: jira_project_key)
      .where(projects: { organization_id: @connector.organization_id })
      .first&.project
  end

  # Refreshes the access token if it is expired or expires within 5 minutes.
  # When token_expires_at is nil the token has never been refreshed — treat it
  # as expired so we always start with a valid token.
  def ensure_valid_token!
    # nil means the provider didn't return expires_in → refresh defensively
    return if @connector.token_expires_at && @connector.token_expires_at > 5.minutes.from_now

    Rails.logger.info("[JiraSyncJob] Token expired or expiring soon, refreshing...")
    provider.refresh_token!
    @connector.reload
    @provider = nil # reset so provider re-initializes with the new token
  end

  def refresh_token
    provider.refresh_token!
  end

  def process_webhook
    event_type = @options[:event_type]
    payload    = @options[:payload]

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
      tool_name:       "jira",
      event_type:      "issue",
      occurred_at:     Time.current,
      metadata: {
        action:      action,
        issue_key:   issue_data["key"],
        issue_id:    issue_data["id"],
        summary:     issue_data.dig("fields", "summary"),
        status:      issue_data.dig("fields", "status", "name"),
        issue_type:  issue_data.dig("fields", "issuetype", "name"),
        project_key: issue_data.dig("fields", "project", "key"),
        assignee:    issue_data.dig("fields", "assignee", "displayName"),
        reporter:    issue_data.dig("fields", "reporter", "displayName"),
        changelog:   extract_changelog(payload)
      }
    )

    attrs   = provider.map_issue(issue_data)
    project = resolve_project_for_key(attrs[:jira_project_key])
    upsert_issues([ attrs ], project) if project
  end

  def process_comment_event(payload, event_type)
    comment = payload["comment"]
    issue   = payload["issue"]
    return unless comment && issue

    action = event_type.gsub("comment_", "")
    occurred_at = Time.zone.parse(comment["created"].to_s) rescue nil
    if occurred_at.nil?
      Rails.logger.warn("[JiraSyncJob] Unparseable comment timestamp: #{comment['created'].inspect}, using Time.current")
      occurred_at = Time.current
    end

    ToolEvent.create!(
      organization_id: @connector.organization_id,
      tool_name:       "jira",
      event_type:      "comment",
      occurred_at:     occurred_at,
      metadata: {
        action:     action,
        comment_id: comment["id"],
        issue_key:  issue["key"],
        author:     comment.dig("author", "displayName")
      }
    )
  end

  def process_sprint_event(payload, event_type)
    sprint = payload["sprint"]
    return unless sprint

    action = event_type.gsub("sprint_", "")

    ToolEvent.create!(
      organization_id: @connector.organization_id,
      tool_name:       "jira",
      event_type:      "sprint",
      occurred_at:     Time.current,
      metadata: {
        action:       action,
        sprint_id:    sprint["id"],
        sprint_name:  sprint["name"],
        sprint_state: sprint["state"],
        board_id:     sprint["originBoardId"]
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
        from:  item["fromString"],
        to:    item["toString"]
      }
    end
  end
end

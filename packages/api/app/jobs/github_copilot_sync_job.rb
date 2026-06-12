# frozen_string_literal: true

class GithubCopilotSyncJob < ApplicationJob
  queue_as :connectors

  def self.enqueue_all
    OrganizationConnector.active.by_type("github_copilot").find_each do |c|
      perform_later(c.id)
    end
  end

  def perform(connector_id)
    @sync_started_at = Time.current
    @connector = OrganizationConnector.find(connector_id)
    provider   = Oauth::GithubCopilotProvider.new(@connector)

    sync_usage(provider)
    # sync_seats must run before sync_billing_usage — it populates @seat_assignee_logins
    sync_seats(provider)
    sync_billing_usage(provider)
    @connector.mark_synced!(sync_started_at: @sync_started_at)

    Rails.logger.info("[GithubCopilotSyncJob] Completed for connector #{connector_id}")
  rescue ActiveRecord::RecordNotFound
    Rails.logger.error("[GithubCopilotSyncJob] Connector #{connector_id} not found")
  rescue StandardError => e
    Rails.logger.error("[GithubCopilotSyncJob] Failed for connector #{connector_id}: #{e.message}")
    @connector&.mark_error!(e.message, sync_started_at: @sync_started_at)
    raise
  end

  private

  def sync_usage(provider)
    since = @connector.last_sync_at || 28.days.ago
    rows  = provider.fetch_usage(since: since)

    if rows.empty?
      Rails.logger.info(
        "[GithubCopilotSyncJob] No usage rows for org '#{@connector.external_org_name}' since #{since}. " \
        "Verify org metrics policy is enabled in GitHub org settings."
      )
      return
    end

    rows.each { |row| upsert_usage_event(row) }
  end

  def upsert_usage_event(row)
    day_str = row["date"]
    return if day_str.blank?

    begin
      day = Date.parse(day_str)
    rescue Date::Error, ArgumentError => e
      Rails.logger.warn("[GithubCopilotSyncJob] Skipping row with unparseable date '#{day_str}': #{e.message}")
      return
    end

    # Aggregate suggestion counts from nested structure:
    # copilot_ide_code_completions.editors[].models[].languages[]
    # These fields are stored in tokens_in/tokens_out for chart compatibility.
    # Note: these are suggestion/acceptance COUNTS, not LLM token counts.
    total_suggestions     = 0
    total_acceptances     = 0
    total_lines_suggested = 0
    total_lines_accepted  = 0

    completions = row["copilot_ide_code_completions"] || {}
    Array(completions["editors"]).each do |editor|
      Array(editor["models"]).each do |model|
        Array(model["languages"]).each do |lang|
          total_suggestions     += lang["total_code_suggestions"].to_i
          total_acceptances     += lang["total_code_acceptances"].to_i
          total_lines_suggested += lang["total_code_lines_suggested"].to_i
          total_lines_accepted  += lang["total_code_lines_accepted"].to_i
        end
      end
    end

    # Idempotent: find_or_initialize_by prevents duplicate rows across re-runs.
    # occurred_at is normalised to UTC midnight for stable deduplication.
    event = ToolEvent.find_or_initialize_by(
      organization_id: @connector.organization_id,
      tool_name:       "github_copilot",
      occurred_at:     day.beginning_of_day.utc
    )
    return unless event.new_record?

    # ModelPricingService.calculate_cost returns { input_cost:, output_cost:, total_cost:, pricing: }.
    # Assign cost_result[:total_cost] — never the whole Hash.
    cost_result = ModelPricingService.calculate_cost(
      tokens_in:  total_suggestions,
      tokens_out: total_acceptances,
      tool:       "github_copilot"
    )

    event.assign_attributes(
      event_type: "completion",
      tokens_in:  total_suggestions,
      tokens_out: total_acceptances,
      cost_usd:   cost_result[:total_cost],
      metadata: {
        lines_suggested: total_lines_suggested,
        lines_accepted:  total_lines_accepted,
        active_users:    row["total_active_users"],
        usage_day:       day_str
      }
    )
    event.save!
  rescue ActiveRecord::RecordNotUnique
    # Concurrent job already inserted this day — idempotent, safe to ignore.
    Rails.logger.debug("[GithubCopilotSyncJob] Skipping duplicate event for #{day_str} (concurrent write)")
  end

  def sync_seats(provider)
    data = provider.fetch_seats
    return if data.blank?

    seats = Array(data["seats"])
    @seat_assignee_logins = seats.filter_map { |s| s.dig("assignee", "login") }
    @seats_config = {
      "seat_count"   => data["total_seats"],
      "active_users" => seats.count { |s| s["last_activity_at"].present? }
    }
  end

  def sync_billing_usage(provider)
    billing = provider.fetch_billing_usage(seat_assignees: Array(@seat_assignee_logins))
    config_patch = (@seats_config || {}).merge(billing || {})
    return if config_patch.blank?

    @connector.update!(
      config: (@connector.config || {}).merge(config_patch)
    )
  end
end

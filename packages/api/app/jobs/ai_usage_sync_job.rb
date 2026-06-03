# frozen_string_literal: true

class AiUsageSyncJob
  include Sidekiq::Job

  sidekiq_options queue: "ai", retry: 3

  SUPPORTED_PROVIDERS = %w[openrouter anthropic openai gemini].freeze

  # OpenRouter Activity API only retains the last 30 completed UTC days.
  # Use 29 days to stay safely within that window.
  OPENROUTER_INITIAL_SYNC_DAYS = 29
  OPENROUTER_RECURRING_SYNC_DAYS = 7

  ANTHROPIC_INITIAL_SYNC_DAYS = 90
  ANTHROPIC_RECURRING_SYNC_DAYS = 7

  OPENAI_INITIAL_SYNC_DAYS = 90
  OPENAI_RECURRING_SYNC_DAYS = 7

  OPENROUTER_MGMT_KEY_ERROR_FRAGMENT = "Only management keys can fetch activity for an account"
  OPENROUTER_DATE_RANGE_ERROR_FRAGMENT = "Date must be within the last 30"

  def perform(organization_id = nil, provider = nil)
    Rails.logger.info("[AiUsageSyncJob] Starting AI usage reconciliation...")

    stats = { organizations_processed: 0, events_reconciled: 0, errors: [] }

    organizations = if organization_id
                      Organization.where(id: organization_id)
    else
                      Organization.all
    end

    organizations.find_each do |org|
      begin
        reconciled = reconcile_organization(org, provider)
        stats[:organizations_processed] += 1
        stats[:events_reconciled] += reconciled
      rescue => e
        stats[:errors] << { organization_id: org.id, error: e.message }
        Rails.logger.error("[AiUsageSyncJob] Error reconciling org #{org.slug}: #{e.message}")
      end
    end

    Rails.logger.info("[AiUsageSyncJob] Completed. Processed: #{stats[:organizations_processed]}, Reconciled: #{stats[:events_reconciled]}, Errors: #{stats[:errors].size}")
    stats
  end

  private

  def reconcile_organization(org, provider_filter = nil)
    total_reconciled = 0

    providers = provider_filter ? [ provider_filter ] : SUPPORTED_PROVIDERS

    providers.each do |provider|
      connector = org.organization_connectors.find_by(connector_type: provider, is_active: true)
      next unless connector

      reconciled = reconcile_provider(org, connector, provider)
      total_reconciled += reconciled
    end

    total_reconciled
  end

  def reconcile_provider(org, connector, provider)
    sync_started_at = Time.current

    # Get usage from provider API
    usage_data = fetch_provider_usage(connector, provider, org)
    return 0 unless usage_data

    # nil means the provider is not yet implemented — skip without touching the connector
    # so its status doesn't falsely read as "connected / synced".
    return 0 if usage_data.nil?

    # nil already handled above; empty array means no new data — still mark synced.
    if usage_data.empty?
      connector.mark_synced!(sync_started_at: sync_started_at)
      return 0
    end

    reconciled = if provider == "openrouter"
      batch_upsert_openrouter_usage(org, usage_data)
    else
      upsert_usage_one_by_one(org, provider, usage_data)
    end

    connector.mark_synced!(sync_started_at: sync_started_at)
    reconciled
  rescue StandardError => e
    error_message = normalize_sync_error(provider, e.message)
    connector.mark_error!(error_message, sync_started_at: sync_started_at)
    Rails.logger.warn("[AiUsageSyncJob] Failed to reconcile #{provider} for org #{org.slug}: #{error_message}")
    0
  end

  # Bulk upsert for OpenRouter daily-aggregate events.
  #
  # Uses BatchConnectorUpsert (3 SQL statements regardless of batch size) instead of
  # the N×1 loop used for other providers. A lazy backfill step seeds
  # connector_event_dedup from pre-existing tool_events so that events created before
  # this path was introduced are not duplicated on the first batch run.
  def batch_upsert_openrouter_usage(org, usage_data)
    backfill_openrouter_dedup(org, usage_data)

    records = usage_data.map do |usage|
      tool_event_attributes_for_usage(usage).merge(
        unique_value: usage[:external_id],
        organization_id: org.id,
        tool_name: "openrouter_api"
      )
    end

    ToolEvents::BatchConnectorUpsert.call(unique_key: "external_id", records:)
    records.size
  end

  # Seeds connector_event_dedup for any openrouter_api tool_events that were created
  # by the old per-row path and are not yet tracked in the dedup table.
  # Runs once per batch; subsequent runs are cheap because all rows already exist.
  def backfill_openrouter_dedup(org, usage_data)
    external_ids = usage_data.map { |u| u[:external_id].to_s }
    return if external_ids.empty?

    already_tracked = ConnectorEventDedup
      .where(
        organization_id: org.id,
        tool_name: "openrouter_api",
        event_type: "completion",
        unique_key: "external_id",
        unique_value: external_ids
      )
      .pluck(:unique_value)
      .to_set

    untracked_ids = external_ids.reject { |id| already_tracked.include?(id) }
    return if untracked_ids.empty?

    existing_events = org.tool_events
      .where(tool_name: "openrouter_api")
      .where("metadata->>'external_id' IN (?)", untracked_ids)
      .pluck(Arel.sql("metadata->>'external_id'"), :id)

    return if existing_events.empty?

    now = Time.current
    dedup_rows = existing_events.map do |external_id, event_id|
      {
        organization_id: org.id,
        tool_name: "openrouter_api",
        event_type: "completion",
        unique_key: "external_id",
        unique_value: external_id,
        tool_event_id: event_id,
        updated_at: now
      }
    end

    upsert_dedup_rows(dedup_rows)
  end

  def upsert_usage_one_by_one(org, provider, usage_data)
    reconciled = 0
    usage_data.each do |usage|
      event = find_matching_event(org, provider, usage)

      if event
        attributes = tool_event_attributes_for_usage(usage)
        metadata = event.metadata.is_a?(Hash) ? event.metadata.deep_stringify_keys : {}
        next_metadata = metadata.merge(attributes.delete(:metadata))

        if sync_update_needed?(event, attributes, next_metadata)
          event.update!(attributes.merge(metadata: next_metadata))
          reconciled += 1
        end
      else
        create_event_from_usage(org, provider, usage)
        reconciled += 1
      end
    end
    reconciled
  end

  def fetch_provider_usage(connector, provider, org)
    case provider
    when "openrouter"
      # org not passed — OpenRouter returns pre-billed costs; pricing overrides don't apply
      fetch_openrouter_usage(connector)
    when "anthropic"
      fetch_anthropic_usage(connector, org)
    when "openai"
      fetch_openai_usage(connector, org)
    when "gemini"
      nil # Not yet implemented — connector will be skipped without updating its status
    else
      nil
    end
  end

  def fetch_openrouter_usage(connector)
    # When the OpenRouter Broadcast Webhook is active, per-request ToolEvents
    # are created in real time by OpenrouterTraceJob. Skip Activity API polling
    # to avoid creating duplicate daily-aggregate events alongside the per-request ones.
    if connector.webhook_active?
      Rails.logger.info("[AiUsageSyncJob] Skipping OpenRouter Activity poll for org #{connector.organization.slug} — webhook active")
      return nil
    end

    days_back = connector.last_sync_at ? OPENROUTER_RECURRING_SYNC_DAYS : OPENROUTER_INITIAL_SYNC_DAYS
    provider = Oauth::OpenrouterProvider.new(connector)
    provider.fetch_activity(start_date: days_back.days.ago.to_date, end_date: Date.yesterday)
  end

def fetch_anthropic_usage(connector, organization)
    # Requires an Admin API key (sk-ant-admin...) stored in connector.access_token
    days_back = connector.last_sync_at ? ANTHROPIC_RECURRING_SYNC_DAYS : ANTHROPIC_INITIAL_SYNC_DAYS
    provider = Oauth::AnthropicProvider.new(connector)
    data = provider.fetch_usage(start_date: days_back.days.ago.to_date, end_date: Date.today)
    return nil unless data

    data.map do |entry|
      cost = ModelPricingService.calculate_cost(
        tokens_in: entry[:tokens_in],
        tokens_out: entry[:tokens_out],
        model: entry[:model],
        organization: organization
      )
      entry.merge(cost_usd: cost[:total_cost])
    end
  end

  def fetch_openai_usage(connector, organization)
    days_back = connector.last_sync_at ? OPENAI_RECURRING_SYNC_DAYS : OPENAI_INITIAL_SYNC_DAYS
    provider = Oauth::OpenaiProvider.new(connector)
    data = provider.fetch_usage(start_date: days_back.days.ago.to_date, end_date: Date.today)
    return nil unless data

    data.map do |entry|
      cost = ModelPricingService.calculate_cost(
        tokens_in: entry[:tokens_in],
        tokens_out: entry[:tokens_out],
        model: entry[:model],
        organization: organization
      )
      entry.merge(cost_usd: cost[:total_cost])
    end
  end

  def find_matching_event(org, provider, usage)
    scope = org.tool_events.where(tool_name: "#{provider}_api")

    match = scope.where("metadata->>'external_id' = ?", usage[:external_id]).first
    return match if match

    Array(usage[:legacy_external_ids]).each do |legacy_id|
      legacy_match = scope.where("metadata->>'external_id' = ?", legacy_id).first
      return legacy_match if legacy_match
    end

    nil
  end

  def create_event_from_usage(org, provider, usage)
    ToolEvent.create!(
      tool_event_attributes_for_usage(usage).merge(
        organization_id: org.id,
        tool_name: "#{provider}_api"
      )
    )
  end

  def tool_event_attributes_for_usage(usage)
    metadata = {
      external_id: usage[:external_id],
      reconciled: true
    }.merge(usage[:metadata] || {})

    {
      event_type: "completion",
      model: usage[:model],
      tokens_in: usage[:tokens_in],
      tokens_out: usage[:tokens_out],
      cost_usd: usage[:cost_usd],
      occurred_at: usage[:occurred_at],
      metadata: metadata
    }
  end

  def sync_update_needed?(event, attributes, metadata)
    comparable_metadata = event.metadata.is_a?(Hash) ? event.metadata.deep_stringify_keys : {}

    event.model != attributes[:model] ||
      event.tokens_in != attributes[:tokens_in] ||
      event.tokens_out != attributes[:tokens_out] ||
      event.cost_usd.to_f != attributes[:cost_usd].to_f ||
      event.occurred_at != attributes[:occurred_at] ||
      comparable_metadata != metadata.deep_stringify_keys
  end

  def normalize_sync_error(provider, error_message)
    return error_message unless provider == "openrouter"

    if error_message.include?(OPENROUTER_MGMT_KEY_ERROR_FRAGMENT)
      "OpenRouter usage sync requires a management key. Reconnect this integration with a management key to fetch activity data."
    elsif error_message.include?(OPENROUTER_DATE_RANGE_ERROR_FRAGMENT)
      "OpenRouter Activity API only provides data for the last 30 days. Sync window has been adjusted automatically — please retry."
    else
      error_message
    end
  end

  # Mirrors BatchConnectorUpsert#bulk_upsert_dedup_rows — raw SQL required
  # because Rails upsert_all sets id = NULL on bigserial columns (Rails 8.1 bug),
  # triggering NOT NULL violation.
  def upsert_dedup_rows(rows)
    return if rows.empty?

    conn = ConnectorEventDedup.connection
    table = ConnectorEventDedup.quoted_table_name
    conflict_cols = %w[organization_id tool_name event_type unique_key unique_value]
                      .map { |c| conn.quote_column_name(c) }.join(", ")
    col_names = rows.first.keys.map { |k| conn.quote_column_name(k) }.join(", ")

    values_sql = rows.map do |row|
      vals = row.values.map { |v| v.nil? ? "NULL" : conn.quote(v) }
      "(#{vals.join(', ')})"
    end.join(", ")

    sql_template = "INSERT INTO %s (%s) VALUES %s ON CONFLICT (%s) DO UPDATE SET tool_event_id = EXCLUDED.tool_event_id, updated_at = EXCLUDED.updated_at"
    conn.execute(format(sql_template, table, col_names, values_sql, conflict_cols))
  end
end

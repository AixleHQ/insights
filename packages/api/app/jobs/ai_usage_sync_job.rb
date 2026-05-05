# frozen_string_literal: true

class AiUsageSyncJob
  include Sidekiq::Job
  include OpenrouterModelHelper

  sidekiq_options queue: "ai", retry: 3

  SUPPORTED_PROVIDERS = %w[openrouter anthropic openai gemini].freeze
  OPENROUTER_RECURRING_OVERLAP_DAYS = 1
  OPENROUTER_MAX_HISTORY_DAYS = 30

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
    usage_data = fetch_provider_usage(connector, provider)

    # nil means the provider is not yet implemented — skip without touching the connector
    # so its status doesn't falsely read as "connected / synced".
    return 0 if usage_data.nil?

    if usage_data.blank?
      connector.mark_synced!
      return 0
    end

    reconciled = if provider == "openrouter"
      batch_upsert_openrouter_usage(org, usage_data)
    else
      upsert_usage_one_by_one(org, provider, usage_data)
    end

    connector.mark_synced!
    reconciled
  rescue StandardError => e
    error_message = normalize_sync_error(provider, e.message)
    connector.mark_error!(error_message)
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
        unique_value:    usage[:external_id],
        organization_id: org.id,
        tool_name:       "openrouter_api"
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
        tool_name:        "openrouter_api",
        event_type:       "completion",
        unique_key:       "external_id",
        unique_value:     external_ids
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
        tool_name:        "openrouter_api",
        event_type:       "completion",
        unique_key:       "external_id",
        unique_value:     external_id,
        tool_event_id:    event_id,
        updated_at:       now
      }
    end

    # Use raw SQL for the same reason as BatchConnectorUpsert#bulk_upsert_dedup_rows:
    # Rails upsert_all includes every column in the INSERT list, which causes
    # `id = NULL` for the bigserial column (Rails 8.1 bug), triggering NOT NULL violation.
    conn          = ConnectorEventDedup.connection
    table         = ConnectorEventDedup.quoted_table_name
    conflict_cols = %w[organization_id tool_name event_type unique_key unique_value]
                      .map { |c| conn.quote_column_name(c) }.join(", ")
    col_names     = dedup_rows.first.keys.map { |k| conn.quote_column_name(k) }.join(", ")

    values_sql = dedup_rows.map do |row|
      vals = row.values.map { |v| v.nil? ? "NULL" : conn.quote(v) }
      "(#{vals.join(', ')})"
    end.join(", ")

    sql_template = "INSERT INTO %s (%s) VALUES %s ON CONFLICT (%s) DO UPDATE SET tool_event_id = EXCLUDED.tool_event_id, updated_at = EXCLUDED.updated_at"
    sql = format(sql_template, table, col_names, values_sql, conflict_cols)

    conn.execute(sql)
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

  def fetch_provider_usage(connector, provider)
    case provider
    when "openrouter"
      fetch_openrouter_usage(connector)
    when "anthropic"
      fetch_anthropic_usage(connector)
    when "openai"
      fetch_openai_usage(connector)
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

    earliest_allowed = OPENROUTER_MAX_HISTORY_DAYS.days.ago.to_date
    start_date = if connector.last_sync_at
      [ connector.last_sync_at.to_date - OPENROUTER_RECURRING_OVERLAP_DAYS.days, earliest_allowed ].max
    else
      earliest_allowed
    end
    end_date = Date.current - 1.day

    return [] if end_date < start_date

    (start_date..end_date).flat_map do |date|
      fetch_openrouter_activity_for_date(connector, date)
    end
  end

  # How far back to sync on the first pull vs recurring syncs.
  ANTHROPIC_INITIAL_SYNC_DAYS = 90
  ANTHROPIC_RECURRING_SYNC_DAYS = 7

  def fetch_anthropic_usage(connector)
    # Requires an Admin API key (sk-ant-admin...) stored in connector.access_token
    days_back = connector.last_sync_at ? ANTHROPIC_RECURRING_SYNC_DAYS : ANTHROPIC_INITIAL_SYNC_DAYS
    provider = Oauth::AnthropicProvider.new(connector)
    data = provider.fetch_usage(start_date: days_back.days.ago.to_date, end_date: Date.today)
    return nil unless data

    data.map do |entry|
      cost = ModelPricingService.calculate_cost(
        tokens_in: entry[:tokens_in],
        tokens_out: entry[:tokens_out],
        model: entry[:model]
      )
      entry.merge(cost_usd: cost[:total_cost])
    end
  end

  def fetch_openai_usage(connector)
    # Not yet implemented — OpenAI usage API returns aggregated data
    # that requires additional mapping work. Returning nil so the connector
    # status is not falsely updated. See reconcile_provider nil-guard.
    nil
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

  def fetch_openrouter_activity_for_date(connector, date)
    uri = URI("https://openrouter.ai/api/v1/activity")
    uri.query = URI.encode_www_form(date: date.iso8601)

    response = perform_json_get(uri, connector.access_token)
    rows = response.fetch("data", [])

    rows.map do |row|
      model = row["model"]
      provider_slug = openrouter_provider_slug(row["provider_name"], model)
      canonical_model = openrouter_canonical_model(model, provider_slug)
      endpoint_id = row["endpoint_id"].presence ||
        "unknown-#{Digest::SHA1.hexdigest(row.to_json)[0, 8]}"
      cost = row["usage"]

      {
        external_id: [ "openrouter", date.iso8601, endpoint_id, canonical_model || "unknown-model" ].join(":"),
        model: canonical_model,
        tokens_in: row["prompt_tokens"],
        tokens_out: row["completion_tokens"],
        cost_usd: cost&.to_f,
        # Activity API returns daily aggregates with no per-request timestamp.
        # Anchor to end-of-day so the event sorts after any per-request events
        # from the same date that may arrive via the webhook path.
        occurred_at: Time.zone.parse("#{date.iso8601} 23:59:59 UTC"),
        metadata: {
          provider: provider_slug,
          routed_model: model,
          model_permaslug: row["model_permaslug"],
          provider_name: row["provider_name"],
          endpoint_id: row["endpoint_id"],
          requests: row["requests"],
          reasoning_tokens: row["reasoning_tokens"],
          byok_usage_inference: row["byok_usage_inference"],
          aggregation_level: "daily_endpoint_model",
          synced_from: "activity_api",
          usage_date: date.iso8601
        }.compact
      }
    end
  end

  def perform_json_get(uri, access_token)
    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = true
    http.open_timeout = 10
    http.read_timeout = 30

    request = Net::HTTP::Get.new(uri)
    request["Authorization"] = "Bearer #{access_token}"

    response = http.request(request)
    unless response.code.to_i == 200
      raise "HTTP #{response.code}: #{response.body}"
    end

    JSON.parse(response.body)
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

    if error_message.include?("Only management keys can fetch activity for an account")
      "OpenRouter usage sync requires a management key. Reconnect this integration with a management key to fetch activity data."
    else
      error_message
    end
  end
end

# frozen_string_literal: true

class AiUsageSyncJob
  include Sidekiq::Job

  sidekiq_options queue: "ai", retry: 3

  SUPPORTED_PROVIDERS = %w[openrouter anthropic openai gemini].freeze
  OPENROUTER_INITIAL_SYNC_DAYS = 90
  OPENROUTER_RECURRING_OVERLAP_DAYS = 1

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
    if usage_data.blank?
      connector.mark_synced!
      return 0
    end

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

    connector.mark_synced!
    reconciled
  rescue StandardError => e
    error_message = normalize_sync_error(provider, e.message)
    connector.mark_error!(error_message)
    Rails.logger.warn("[AiUsageSyncJob] Failed to reconcile #{provider} for org #{org.slug}: #{error_message}")
    0
  end

  def fetch_provider_usage(connector, provider)
    case provider
    when "openrouter"
      fetch_openrouter_usage(connector)
    when "anthropic"
      fetch_anthropic_usage(connector)
    when "openai"
      fetch_openai_usage(connector)
    else
      nil
    end
  end

  def fetch_openrouter_usage(connector)
    start_date = if connector.last_sync_at
      connector.last_sync_at.to_date - OPENROUTER_RECURRING_OVERLAP_DAYS.days
    else
      OPENROUTER_INITIAL_SYNC_DAYS.days.ago.to_date
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

    Rails.logger.info("[Anthropic API] Raw usage data (#{data.size} entries): #{JSON.pretty_generate(data)}")

    enriched = data.map do |entry|
      cost = ModelPricingService.calculate_cost(
        tokens_in: entry[:tokens_in],
        tokens_out: entry[:tokens_out],
        model: entry[:model]
      )
      entry.merge(cost_usd: cost[:total_cost])
    end

    Rails.logger.info("[Anthropic API] Enriched with cost (#{enriched.size} entries): #{JSON.pretty_generate(enriched)}")

    enriched
  end

  def fetch_openai_usage(connector)
    # OpenAI usage endpoint
    uri = URI("https://api.openai.com/v1/usage")
    uri.query = URI.encode_www_form(date: Date.today.to_s)

    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = true

    request = Net::HTTP::Get.new(uri)
    request["Authorization"] = "Bearer #{connector.access_token}"

    response = http.request(request)
    return nil unless response.code.to_i == 200

    data = JSON.parse(response.body)
    # OpenAI returns aggregated usage, not individual requests
    # This would need to be adapted based on actual API response
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
      endpoint_id = row["endpoint_id"].presence || "unknown-endpoint"
      cost = row["usage"]

      {
        external_id: [ "openrouter", date.iso8601, endpoint_id, canonical_model || "unknown-model" ].join(":"),
        model: canonical_model,
        tokens_in: row["prompt_tokens"],
        tokens_out: row["completion_tokens"],
        cost_usd: cost&.to_f,
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

    request = Net::HTTP::Get.new(uri)
    request["Authorization"] = "Bearer #{access_token}"

    response = http.request(request)
    unless response.code.to_i == 200
      raise "HTTP #{response.code}: #{response.body}"
    end

    JSON.parse(response.body)
  end

  def openrouter_provider_slug(provider_name, model)
    return model.split("/").first.downcase if model.to_s.include?("/")
    return if provider_name.blank?

    provider_name.to_s.downcase.strip.gsub(/[^a-z0-9]+/, "_").gsub(/\A_|_\z/, "")
  end

  def openrouter_canonical_model(model, provider_slug)
    return if model.blank?
    return model if model.include?("/")

    provider_slug.present? ? "#{provider_slug}/#{model}" : model
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

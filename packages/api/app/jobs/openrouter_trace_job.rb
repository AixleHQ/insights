# frozen_string_literal: true

# Processes an OpenRouter Broadcast Webhook OTLP payload and upserts a
# per-request ToolEvent for each span (generation) found in the trace.
#
# Enqueued by Api::V1::OpenrouterTracesController#receive after signature
# verification and connector resolution.
#
# OTLP attribute mapping:
#   gen_ai.request.model            → model
#   gen_ai.usage.prompt_tokens      → tokens_in
#   gen_ai.usage.completion_tokens  → tokens_out
#   openrouter.generation.cost      → cost_usd   (USD, from OpenRouter)
#   startTimeUnixNano               → occurred_at
#   traceId                         → metadata.external_id
#   gen_ai.openrouter.provider_name → metadata.provider
#
# Idempotency: events are upserted by (organization_id, metadata.external_id).
# If Activity API polling already created an aggregated event for the same day,
# the webhook job overwrites it with precise per-request data.
class OpenrouterTraceJob
  include Sidekiq::Job

  sidekiq_options queue: "ai", retry: 3

  def perform(connector_id, payload_json)
    connector = OrganizationConnector.find_by(id: connector_id)
    unless connector
      Rails.logger.warn("[OpenrouterTraceJob] Connector #{connector_id} not found, skipping")
      return
    end

    payload = JSON.parse(payload_json)
    spans = extract_spans(payload)

    if spans.empty?
      Rails.logger.info("[OpenrouterTraceJob] No spans in payload for connector #{connector_id}")
      return
    end

    upserted = 0
    spans.each do |span|
      attrs = span_attributes(span)
      next unless generation_span?(span, attrs)

      event_data = build_event_data(span, attrs, connector)
      next if event_data.nil?

      upsert_tool_event(event_data, connector)
      upserted += 1
    end

    Rails.logger.info("[OpenrouterTraceJob] Upserted #{upserted} events for org #{connector.organization_id}")

    # Mark webhook as active after the first successful delivery so AiUsageSyncJob
    # stops polling the Activity API and avoids double-counting.
    connector.update_column(:webhook_active, true) if upserted > 0 && !connector.webhook_active?
  end

  private

  # Only process spans that represent an LLM generation (chat completion).
  # Skip provider-retry spans, tool-call spans, etc.
  def generation_span?(span, attrs)
    name = span["name"].to_s
    api_type = attrs["gen_ai.openrouter.api_type"]
    name.include?("chat") || name.include?("completion") || api_type == "completions"
  end

  def build_event_data(span, attrs, connector)
    model_raw   = attrs["gen_ai.request.model"].presence || attrs["gen_ai.response.model"]
    return nil if model_raw.blank?

    provider_name = attrs["gen_ai.openrouter.provider_name"]
    provider_slug = openrouter_provider_slug(provider_name, model_raw)
    canonical_model = openrouter_canonical_model(model_raw, provider_slug)

    tokens_in  = attrs["gen_ai.usage.prompt_tokens"].to_i
    tokens_out = attrs["gen_ai.usage.completion_tokens"].to_i

    # OpenRouter stores cost in USD directly in the trace
    cost_usd = (attrs["openrouter.generation.cost"] ||
                attrs["gen_ai.usage.cost"] ||
                attrs["openrouter.usage"]).then { |v| v&.to_f }

    occurred_at = parse_occurred_at(span["startTimeUnixNano"])
    return nil if occurred_at.nil?

    # traceId uniquely identifies this generation across all providers
    external_id = "openrouter-trace:#{span["traceId"] || span["spanId"]}"

    {
      organization_id: connector.organization_id,
      tool_name: "openrouter_api",
      event_type: "completion",
      model: canonical_model,
      tokens_in: tokens_in,
      tokens_out: tokens_out,
      cost_usd: cost_usd,
      occurred_at: occurred_at,
      duration_ms: parse_duration_ms(span["startTimeUnixNano"], span["endTimeUnixNano"]),
      metadata: {
        external_id: external_id,
        provider: provider_slug,
        routed_model: model_raw,
        provider_name: provider_name,
        model_permaslug: attrs["gen_ai.openrouter.model_permaslug"],
        finish_reason: attrs["gen_ai.finish_reason"],
        is_byok: attrs["gen_ai.openrouter.is_byok"],
        synced_from: "otlp_webhook",
        reconciled: true
      }.compact
    }
  end

  def upsert_tool_event(event_data, connector)
    external_id = event_data.dig(:metadata, :external_id)
    existing = connector.organization.tool_events
                        .where(tool_name: "openrouter_api")
                        .where("metadata->>'external_id' = ?", external_id)
                        .first

    if existing
      metadata = existing.metadata.is_a?(Hash) ? existing.metadata.deep_stringify_keys : {}
      merged_metadata = metadata.merge(event_data[:metadata].stringify_keys)

      existing.update!(
        model: event_data[:model],
        tokens_in: event_data[:tokens_in],
        tokens_out: event_data[:tokens_out],
        cost_usd: event_data[:cost_usd],
        occurred_at: event_data[:occurred_at],
        duration_ms: event_data[:duration_ms],
        metadata: merged_metadata
      )
    else
      ToolEvent.create!(event_data)
    end
  rescue ActiveRecord::RecordInvalid => e
    Rails.logger.error("[OpenrouterTraceJob] Failed to upsert event (external_id=#{external_id}): #{e.message}")
  end

  def extract_spans(payload)
    Array(payload["resourceSpans"]).flat_map do |rs|
      Array(rs["scopeSpans"]).flat_map { |ss| Array(ss["spans"]) }
    end
  end

  def span_attributes(span)
    Array(span["attributes"]).each_with_object({}) do |attr, hash|
      key = attr["key"]
      value = attr.dig("value", "stringValue") ||
              attr.dig("value", "intValue") ||
              attr.dig("value", "doubleValue") ||
              attr.dig("value", "boolValue")
      hash[key] = value if key
    end
  end

  # Converts OTLP nanoseconds timestamp to Time.
  def parse_occurred_at(nano_str)
    return nil if nano_str.blank?
    Time.zone.at(nano_str.to_i / 1_000_000_000.0)
  rescue ArgumentError
    nil
  end

  def parse_duration_ms(start_nano, end_nano)
    return nil if start_nano.blank? || end_nano.blank?
    ((end_nano.to_i - start_nano.to_i) / 1_000_000.0).round
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
end

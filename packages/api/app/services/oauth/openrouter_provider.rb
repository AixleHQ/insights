# frozen_string_literal: true

module Oauth
  class OpenrouterProvider < BaseProvider
    include OpenrouterModelHelper

    API_URL = "https://openrouter.ai"
    ACTIVITY_URL = "#{API_URL}/api/v1/activity"

    MAX_RETRIES = 2
    BASE_RETRY_DELAY = 1.0

    # Fetches org-level activity aggregated by date/endpoint/model.
    # Returns one entry per date/endpoint/model combination.
    # Requires a Management API key stored in connector.access_token.
    # Raises on API errors so that the caller (reconcile_provider) can mark_error!
    # and surface the failure rather than silently leaving the connector in "testing" status.
    def fetch_activity(start_date:, end_date:)
      return [] if end_date < start_date

      (start_date..end_date).flat_map do |date|
        fetch_activity_for_date(date)
      end
    end

    def test_connection
      response = Faraday.get("#{API_URL}/api/v1/models") do |req|
        req.headers["Authorization"] = "Bearer #{connector.access_token}"
        req.headers["Accept"] = "application/json"
      end

      if response.success?
        { success: true }
      elsif response.status == 401 || response.status == 403
        { success: false, error: "Invalid API key" }
      else
        { success: false, error: "OpenRouter API error: #{response.status}" }
      end
    rescue Faraday::Error => e
      { success: false, error: "Connection error: #{e.message}" }
    end

    private

    def fetch_activity_for_date(date)
      uri = URI("#{ACTIVITY_URL}?#{URI.encode_www_form(date: date.iso8601)}")
      body = fetch_with_retry(uri)
      rows = body.fetch("data", [])

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

    def fetch_with_retry(uri)
      retries = 0
      loop do
        response = http_client.get(uri.to_s)
        if response.status == 429 && retries < MAX_RETRIES
          retries += 1
          sleep(BASE_RETRY_DELAY * (2**(retries - 1)))
          next
        end
        raise "HTTP #{response.status}: #{response.body}" unless response.success?

        return JSON.parse(response.body)
      end
    rescue Faraday::Error => e
      raise "Connection error: #{e.message}"
    end
  end
end

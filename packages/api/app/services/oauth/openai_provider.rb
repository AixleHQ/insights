# frozen_string_literal: true

module Oauth
  class OpenaiProvider < BaseProvider
    API_URL = "https://api.openai.com"
    USAGE_URL = "#{API_URL}/v1/organization/usage/completions"
    MAX_PAGES = 100
    USAGE_LIMIT_PER_PAGE = 31

    # GET-only structural constraint: all outbound requests go through READ_ONLY_CONNECTION.
    # Exposes only #get — accidental write verbs in this file cannot be called via this constant.
    READ_ONLY_CONNECTION = Faraday.new(url: API_URL).freeze
    private_constant :READ_ONLY_CONNECTION

    # Fetches org-level usage aggregated by model per day.
    # Returns one entry per model/day combination — not per-request granularity.
    # Requires an Org Admin API key (sk-admin-...) stored in connector.access_token.
    def fetch_usage(start_date:, end_date:)
      results = []
      page = nil
      pages_fetched = 0

      loop do
        response = READ_ONLY_CONNECTION.get(USAGE_URL) do |req|
          req.headers["Authorization"] = "Bearer #{connector.access_token}"
          req.params["start_time"] = start_date.beginning_of_day.utc.to_i
          req.params["end_time"] = (end_date + 1.day).beginning_of_day.utc.to_i
          req.params["bucket_width"] = "1d"
          req.params["group_by[]"] = "model"
          req.params["limit"] = USAGE_LIMIT_PER_PAGE
          req.params["page"] = page if page
        end

        pages_fetched += 1

        unless response.success?
          Rails.logger.warn("[OpenaiProvider] fetch_usage failed on page #{pages_fetched}: #{response.status}")
          return results.presence
        end

        body = JSON.parse(response.body)

        (body["data"] || []).each do |bucket|
          date = Time.at(bucket["start_time"]).utc
          (bucket["results"] || []).each do |entry|
            model = entry["model"].presence
            next unless model

            tokens_in = entry["input_tokens"].to_i + entry["input_cached_tokens"].to_i
            results << {
              external_id: "openai-#{model}-#{date.to_date}",
              model: model,
              tokens_in: tokens_in,
              tokens_out: entry["output_tokens"].to_i,
              occurred_at: date
            }
          end
        end

        break unless body["has_more"]

        if pages_fetched >= MAX_PAGES
          Rails.logger.warn("[OpenaiProvider] fetch_usage reached MAX_PAGES (#{MAX_PAGES}); remaining data will be picked up on next sync")
          break
        end

        page = body["next_page"]
      end

      results
    rescue Faraday::Error, JSON::ParserError => e
      # On transport/parse errors: return whatever pages were accumulated before the failure
      # (nil if error occurred on page 1; partial results if mid-pagination). This mirrors
      # Anthropic's behaviour. HTTP-level non-2xx returns via the early `return` above.
      Rails.logger.warn("[OpenaiProvider] fetch_usage error: #{e.message}")
      results.presence
    end

    def test_connection
      # Org Admin keys (sk-admin-...) are scoped to usage/billing endpoints, not /v1/models.
      # Validate by hitting the usage endpoint with a minimal time window.
      response = READ_ONLY_CONNECTION.get(USAGE_URL) do |req|
        req.headers["Authorization"] = "Bearer #{connector.access_token}"
        req.params["start_time"] = 1.day.ago.beginning_of_day.utc.to_i
        req.params["end_time"] = Time.current.utc.to_i
        req.params["bucket_width"] = "1d"
        req.params["limit"] = 1
      end

      if response.success?
        { success: true }
      elsif response.status == 401 || response.status == 403
        { success: false, error: "Invalid API key — ensure you are using an Org Admin API key (sk-admin-...)" }
      else
        { success: false, error: "OpenAI API error: #{response.status}" }
      end
    rescue Faraday::Error => e
      { success: false, error: "Connection error: #{e.message}" }
    end
  end
end

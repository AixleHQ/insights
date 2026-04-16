# frozen_string_literal: true

module Oauth
  class AnthropicProvider < BaseProvider
    API_URL = "https://api.anthropic.com"
    API_VERSION = "2023-06-01"
    USAGE_URL = "#{API_URL}/v1/organizations/usage_report/messages"
    MAX_PAGES = 100

    # Fetches org-level usage aggregated by model per day.
    # Returns one entry per model/day combination — not per-request granularity.
    # Requires an Admin API key (sk-ant-admin...) stored in connector.access_token.
    def fetch_usage(start_date:, end_date:)
      results = []
      page = nil
      pages_fetched = 0

      loop do
        response = Faraday.get(USAGE_URL) do |req|
          req.headers["x-api-key"] = connector.access_token
          req.headers["anthropic-version"] = API_VERSION
          req.params["starting_at"] = start_date.beginning_of_day.utc.iso8601
          req.params["ending_at"] = end_date.end_of_day.utc.iso8601
          req.params["bucket_width"] = "1d"
          req.params["group_by[]"] = "model"
          req.params["page"] = page if page
        end

        pages_fetched += 1

        unless response.success?
          Rails.logger.warn("[AnthropicProvider] fetch_usage failed on page #{pages_fetched}: #{response.status}")
          return results.presence
        end

        body = JSON.parse(response.body)

        body["data"].each do |bucket|
          date = Time.parse(bucket["starting_at"])
          (bucket["results"] || []).each do |entry|
            cache_creation = entry["cache_creation"] || {}
            cache_tokens = cache_creation.sum { |k, v| k.end_with?("_tokens") ? v.to_i : 0 }
            tokens_in = entry["uncached_input_tokens"].to_i +
              entry["cache_read_input_tokens"].to_i +
              cache_tokens

            results << {
              external_id: "anthropic-#{entry["model"]}-#{date.to_date}",
              model: entry["model"],
              tokens_in: tokens_in,
              tokens_out: entry["output_tokens"].to_i,
              occurred_at: date
            }
          end
        end

        break unless body["has_more"]
        break if pages_fetched >= MAX_PAGES

        page = body["next_page"]
      end

      results
    rescue Faraday::Error, JSON::ParserError => e
      Rails.logger.warn("[AnthropicProvider] fetch_usage error: #{e.message}")
      results.presence
    end

    def test_connection
      response = Faraday.get("#{API_URL}/v1/models") do |req|
        req.headers["x-api-key"] = connector.access_token
        req.headers["anthropic-version"] = API_VERSION
        req.headers["Accept"] = "application/json"
      end

      if response.success?
        { success: true }
      elsif response.status == 401 || response.status == 403
        { success: false, error: "Invalid API key" }
      else
        { success: false, error: "Anthropic API error: #{response.status}" }
      end
    rescue Faraday::Error => e
      { success: false, error: "Connection error: #{e.message}" }
    end
  end
end

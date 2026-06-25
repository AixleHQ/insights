# frozen_string_literal: true

module Oauth
  class AnthropicProvider < BaseProvider
    API_URL = "https://api.anthropic.com"
    API_VERSION = "2023-06-01"
    USAGE_URL = "#{API_URL}/v1/organizations/usage_report/messages"
    MAX_PAGES = 100

    # Structural GET-only constraint: all outbound requests must go through this
    # connection. It exposes only #get — accidental write verbs in this file
    # would not be usable via READ_ONLY_CONNECTION.
    READ_ONLY_CONNECTION = Faraday.new(url: API_URL) do |f|
      f.headers["anthropic-version"] = API_VERSION
    end.freeze
    private_constant :READ_ONLY_CONNECTION

    # Fetches org-level usage aggregated by model and workspace per day.
    # Returns one entry per model/workspace/day combination — not per-request granularity.
    # Requires an Admin API key (sk-ant-admin...) stored in connector.access_token.
    def fetch_usage(start_date:, end_date:)
      results = []
      page = nil
      pages_fetched = 0

      loop do
        response = READ_ONLY_CONNECTION.get(USAGE_URL) do |req|
          req.headers["x-api-key"] = connector.access_token
          req.params["starting_at"] = start_date.beginning_of_day.utc.iso8601
          req.params["ending_at"] = end_date.end_of_day.utc.iso8601
          req.params["bucket_width"] = "1d"
          req.params["group_by"] = %w[model workspace_name]
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

            workspace = entry["workspace_name"].presence
            id_parts = [ "anthropic", workspace, entry["model"], date.to_date ].compact

            results << {
              external_id: id_parts.join("-"),
              model: entry["model"],
              workspace_name: workspace,
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
      # Admin keys are scoped to usage-reporting endpoints, not /v1/models.
      # Guard on format first — non-admin keys can return HTTP 200 with empty data
      # from the usage endpoint, which would silently pass the HTTP-status check.
      unless connector.access_token.to_s.start_with?("sk-ant-admin")
        return { success: false, error: "Invalid API key — ensure you are using an Admin API key (sk-ant-admin-...)" }
      end

      # Validate by hitting the usage report endpoint with a minimal date range.
      response = READ_ONLY_CONNECTION.get(USAGE_URL) do |req|
        req.headers["x-api-key"] = connector.access_token
        req.params["starting_at"] = 1.day.ago.beginning_of_day.utc.iso8601
        req.params["ending_at"] = 1.day.ago.end_of_day.utc.iso8601
        req.params["bucket_width"] = "1d"
      end

      if response.success?
        { success: true }
      elsif response.status == 401 || response.status == 403
        { success: false, error: "Invalid API key — ensure you are using an Admin API key (sk-ant-admin-...)" }
      else
        { success: false, error: "Anthropic API error: #{response.status}" }
      end
    rescue Faraday::Error => e
      { success: false, error: "Connection error: #{e.message}" }
    end
  end
end

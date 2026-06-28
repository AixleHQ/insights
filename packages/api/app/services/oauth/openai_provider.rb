# frozen_string_literal: true

module Oauth
  class OpenaiProvider < BaseProvider
    API_URL = "https://api.openai.com"
    USAGE_URL = "#{API_URL}/v1/organization/usage/completions"
    COSTS_URL = "#{API_URL}/v1/organization/costs"
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
      base_params = {
        "start_time"   => start_date.beginning_of_day.utc.to_i,
        "end_time"     => (end_date + 1.day).beginning_of_day.utc.to_i,
        "bucket_width" => "1d",
        "group_by[]"   => "model",
        "limit"        => USAGE_LIMIT_PER_PAGE
      }

      completed = paginate_request(url: USAGE_URL, base_params:) do |body|
        (body["data"] || []).each do |bucket|
          date = Time.at(bucket["start_time"]).utc
          (bucket["results"] || []).each do |entry|
            model = entry["model"].presence
            next unless model

            tokens_in = entry["input_tokens"].to_i + entry["input_cached_tokens"].to_i
            results << {
              external_id: "openai-#{model}-#{date.to_date}",
              model:       model,
              tokens_in:   tokens_in,
              tokens_out:  entry["output_tokens"].to_i,
              occurred_at: date
            }
          end
        end
      end

      # Return nil on transport/parse failure so the job skips without updating connector status.
      # On success (including empty windows), return results as-is.
      completed ? results : results.presence
    end

    # Fetches org-level billed costs aggregated by model per day.
    # Returns a Hash keyed by [normalized_model, date] => cost_usd (Float).
    # Raises Oauth::PermissionDeniedError on 403. Returns a partial hash on other failures.
    def fetch_costs(start_date:, end_date:)
      costs = {}
      base_params = {
        "start_time"   => start_date.beginning_of_day.utc.to_i,
        "end_time"     => (end_date + 1.day).beginning_of_day.utc.to_i,
        "bucket_width" => "1d",
        "group_by[]"   => "model",
        "limit"        => USAGE_LIMIT_PER_PAGE
      }

      paginate_request(url: COSTS_URL, base_params:) do |body|
        (body["data"] || []).each do |bucket|
          date = Time.at(bucket["start_time"]).utc.to_date
          (bucket["results"] || []).each do |entry|
            # API may return model identifier under "model" or "line_item" (e.g. "model-gpt-4o").
            raw_model = entry["model"].presence || entry["line_item"].presence
            next unless raw_model

            model  = raw_model.delete_prefix("model-")
            amount = entry.dig("amount", "value")
            next unless amount

            currency = entry.dig("amount", "currency").to_s.downcase
            unless currency == "usd"
              Rails.logger.warn("[OpenaiProvider] fetch_costs: unexpected currency #{currency} for #{model} on #{date} — skipping")
              next
            end

            costs[[ model, date ]] = costs[[ model, date ]].to_f + amount.to_f
          end
        end
      end

      # Always return the costs hash — empty or partial is valid; callers fall back to
      # ModelPricingService for entries without a matching cost bucket.
      costs
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

    private

    # Handles cursor pagination for the OpenAI admin API.
    # Yields each page's parsed body to the block for accumulation.
    # Returns true on clean completion, false on transport/parse failure.
    # Raises Oauth::PermissionDeniedError on 403 — intentionally not caught here.
    def paginate_request(url:, base_params:)
      page          = nil
      pages_fetched = 0
      endpoint      = url.split("/").last(2).join("/")

      loop do
        response = READ_ONLY_CONNECTION.get(url) do |req|
          req.headers["Authorization"] = "Bearer #{connector.access_token}"
          base_params.each { |k, v| req.params[k] = v }
          req.params["page"] = page if page
        end

        pages_fetched += 1

        unless response.success?
          raise PermissionDeniedError,
            "OpenAI admin key lacks permissions (403). Use an sk-admin-… key." if response.status == 403
          Rails.logger.warn("[OpenaiProvider] #{endpoint} failed on page #{pages_fetched}: #{response.status}")
          return false
        end

        body = JSON.parse(response.body)
        yield body

        break unless body["has_more"]

        if pages_fetched >= MAX_PAGES
          Rails.logger.warn("[OpenaiProvider] #{endpoint} reached MAX_PAGES (#{MAX_PAGES}); remaining data will be picked up on next sync")
          break
        end

        page = body["next_page"]
      end

      true
    rescue Faraday::Error, JSON::ParserError => e
      Rails.logger.warn("[OpenaiProvider] #{endpoint} error: #{e.message}")
      false
    end
  end
end

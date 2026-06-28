# frozen_string_literal: true

module Oauth
  class GithubCopilotProvider < BaseProvider
    API_URL      = "https://api.github.com"
    BILLING_BASE = "https://api.github.com/organizations"

    AI_CREDIT_PATH   = "settings/billing/ai_credit/usage"
    PREMIUM_REQ_PATH = "settings/billing/premium_request/usage"
    PER_USER_SEAT_CAP = 200

    # Probe billing endpoint to verify manage_billing:copilot scope is active.
    # GET /orgs/{org}/copilot/billing returns 200 with seat summary or
    # 404/403 if Copilot is not enabled / token lacks scope.
    def test_connection
      ensure_fresh_token!
      org = connector.external_org_name
      unless org.present?
        return { success: false, error: "GitHub org not set — OAuth did not resolve an admin org" }
      end

      response = copilot_client.get("#{API_URL}/orgs/#{org}/copilot/billing")
      case response.status
      when 200
        { success: true }
      when 422
        { success: false, error: "GitHub Copilot billing API returned 422. Verify billing is enabled for org '#{org}'." }
      when 403
        { success: false, error: "Token lacks manage_billing:copilot scope or user is not a billing manager." }
      when 404
        { success: false, error: "GitHub Copilot not enabled for org '#{org}' or org not found." }
      else
        { success: false, error: "Copilot billing API error: HTTP #{response.status}" }
      end
    rescue Faraday::Error => e
      { success: false, error: "Connection error: #{e.message}" }
    end

    # Fetch daily Copilot usage metrics via GET /orgs/{org}/copilot/metrics
    #
    # Confirmed endpoint (spike, 2026-04-29):
    #   - /copilot/usage was retired 2026-04-02; use /copilot/metrics
    #   - Response: bare JSON array of daily objects
    #   - Date field: "date" (not "day")
    #   - No flat suggestion totals — counts are nested under:
    #     copilot_ide_code_completions.editors[].models[].languages[]
    #   - `since` param requires full ISO 8601 (YYYY-MM-DDTHH:MM:SSZ)
    #   - API version header: 2026-03-10
    #
    # Returns an array of daily metric objects.
    def fetch_usage(since: 28.days.ago)
      org = connector.external_org_name
      rows = []
      page = 1

      loop do
        response = copilot_client.get("#{API_URL}/orgs/#{org}/copilot/metrics") do |req|
          req.params["since"]    = since.utc.strftime("%Y-%m-%dT%H:%M:%SZ")
          req.params["per_page"] = 100
          req.params["page"]     = page
        end

        if response.status == 422
          Rails.logger.warn("[GithubCopilotProvider] Copilot metrics not enabled for org '#{org}' (422)")
          return []
        end

        break unless response.success?

        parsed = JSON.parse(response.body)
        raise "Unexpected Copilot metrics shape: expected Array, got #{parsed.class}" unless parsed.is_a?(Array)

        break if parsed.empty?

        rows.concat(parsed)
        break if parsed.size < 100

        page += 1
      end

      rows
    end

    # Fetch monthly billing usage from the GitHub billing API.
    #
    # Tries AI Credits (current model, post-Jun 1 2026) first, then falls back to
    # Premium Request Usage for grandfathered annual plans. Returns a config-ready
    # hash on success; {} on any failure so billing errors never abort the main sync.
    #
    # seat_assignees: array of GitHub login strings from fetch_seats for per-user rollup.
    # Per-user queries are skipped when seat_assignees.size > PER_USER_SEAT_CAP.
    def fetch_billing_usage(seat_assignees: [])
      org = connector.external_org_name

      raw, billing_model = try_billing_endpoint(org, AI_CREDIT_PATH, "ai_credits") ||
                           try_billing_endpoint(org, PREMIUM_REQ_PATH, "premium_requests")
      return {} if raw.nil?

      org_rollup = aggregate_usage_items(raw["usageItems"])
      return {} if org_rollup.empty?

      result = org_rollup.merge(
        "billing_model"        => billing_model,
        "billing_period_start" => billing_period_start(raw["timePeriod"]),
        "billing_period_end"   => billing_period_end(raw["timePeriod"])
      )

      if seat_assignees.size > PER_USER_SEAT_CAP
        Rails.logger.info(
          "[GithubCopilotProvider] Skipping per-user billing: " \
          "#{seat_assignees.size} seats exceeds cap of #{PER_USER_SEAT_CAP}"
        )
      elsif seat_assignees.any?
        by_user = fetch_per_user_billing(org, seat_assignees, billing_model)
        result["billing_by_user"] = by_user if by_user.present?
      end

      result
    rescue Faraday::Error, JSON::ParserError => e
      Rails.logger.warn("[GithubCopilotProvider] fetch_billing_usage failed: #{e.message}")
      {}
    end

    # Fetch seat allocation info from GET /orgs/{org}/copilot/billing/seats.
    # Paginates fully — orgs with >100 seats would otherwise silently under-count
    # active users since only the first page would be inspected.
    # Shape per page: { "total_seats": N, "seats": [{ "assignee": {...}, "last_activity_at": "..." }] }
    def fetch_seats
      org       = connector.external_org_name
      page      = 1
      all_seats = []
      total_seats = nil

      loop do
        response = copilot_client.get("#{API_URL}/orgs/#{org}/copilot/billing/seats") do |req|
          req.params["per_page"] = 100
          req.params["page"]     = page
        end
        break unless response.success?

        data = JSON.parse(response.body)
        total_seats ||= data["total_seats"]
        batch = Array(data["seats"])
        all_seats.concat(batch)
        break if batch.size < 100

        page += 1
      end

      return {} if total_seats.nil?

      { "total_seats" => total_seats, "seats" => all_seats }
    end

    class << self
      # Reuses the existing GitHub OAuth app (same client_id/secret).
      # The token stored on this connector must carry manage_billing:copilot scope;
      # the VCS GitHub connector token typically will not.
      def client_id
        Rails.application.credentials.dig(:github, :client_id) ||
          ENV.fetch("GITHUB_CLIENT_ID", nil)
      end

      def client_secret
        Rails.application.credentials.dig(:github, :client_secret) ||
          ENV.fetch("GITHUB_CLIENT_SECRET", nil)
      end

      def authorize_endpoint = "https://github.com/login/oauth/authorize"
      def token_endpoint     = "https://github.com/login/oauth/access_token"

      # manage_billing:copilot requires the user to be an org billing manager or owner.
      # read:org is needed to list memberships for org slug resolution.
      def scopes = %w[manage_billing:copilot read:org]

      # Resolves the GitHub org slug for API paths.
      # Calls /user/memberships/orgs?role=admin and takes the first active admin org.
      # Returns `organization.login` (slug) as account_name — this is required for
      # /orgs/{org}/... path segments, NOT the display name.
      #
      # v1 limitation: if the user is admin of multiple orgs, only the first result is used.
      def fetch_account_info(access_token)
        response = Faraday.get("#{API_URL}/user/memberships/orgs") do |req|
          req.headers["Authorization"] = "Bearer #{access_token}"
          req.headers["Accept"]        = "application/vnd.github+json"
          req.headers["X-GitHub-Api-Version"] = "2026-03-10"
          req.params["state"]          = "active"
          req.params["role"]           = "admin"
          req.params["per_page"]       = 30
        end
        return {} unless response.success?

        memberships = JSON.parse(response.body)
        return {} unless memberships.is_a?(Array) && memberships.first

        org = memberships.first["organization"]
        return {} unless org

        {
          account_id:   org["id"].to_s,
          account_name: org["login"]   # slug, used in /orgs/{org}/... API paths
        }
      end
    end

    private

    # Attempts a single billing endpoint. Returns [parsed_body, model_name] on success
    # with non-empty usageItems, nil otherwise. 404 is expected (endpoint doesn't apply
    # to this org's billing model) and logged at debug. Other non-2xx responses indicate
    # scope/auth issues and are logged at warn so billing gaps are observable.
    def try_billing_endpoint(org, path, model_name)
      response = copilot_client.get("#{BILLING_BASE}/#{org}/#{path}")

      unless response.success?
        if response.status == 404
          Rails.logger.debug("[GithubCopilotProvider] #{path} not found for org '#{org}' (404)")
        else
          Rails.logger.warn(
            "[GithubCopilotProvider] #{path} returned HTTP #{response.status} for org '#{org}'"
          )
        end
        return nil
      end

      parsed = JSON.parse(response.body)
      items  = Array(parsed["usageItems"])
      return nil if items.empty?

      [ parsed, model_name ]
    rescue Faraday::Error, JSON::ParserError
      nil
    end

    # Aggregates all usageItems into org-level canonical fields.
    # Uses netAmount/netQuantity as the authoritative above-allowance figures.
    def aggregate_usage_items(items)
      return {} if items.blank?

      sums = items.each_with_object(
        "gross" => 0, "discount" => 0, "net_qty" => 0, "net_amt" => BigDecimal("0")
      ) do |item, acc|
        acc["gross"]    += item["grossQuantity"].to_i
        acc["discount"] += item["discountQuantity"].to_i
        acc["net_qty"]  += item["netQuantity"].to_i
        acc["net_amt"]  += BigDecimal(item["netAmount"].to_s)
      end

      {
        "metered_units_used" => sums["gross"],
        "included_units"     => sums["discount"],
        "overage_units"      => sums["net_qty"],
        "overage_cost_usd"   => sums["net_amt"].to_f.round(4)
      }
    end

    def billing_period_start(time_period)
      return nil unless time_period
      Date.new(time_period["year"], time_period["month"], 1).iso8601
    end

    def billing_period_end(time_period)
      return nil unless time_period
      Date.new(time_period["year"], time_period["month"], 1).end_of_month.iso8601
    end

    # Per-user billing rollup. Endpoint and response shape to be confirmed post-spike.
    # Returns {} until per-user endpoint is verified; org-level data is sufficient for AIX-253.
    def fetch_per_user_billing(_org, _logins, _billing_model)
      {}
    end

    # Faraday client with GitHub API version header required by Copilot endpoints.
    # Confirmed API version: 2026-03-10 (spike, 2026-04-29).
    def copilot_client
      @copilot_client ||= Faraday.new do |conn|
        conn.headers["Authorization"]        = "Bearer #{connector.access_token}"
        conn.headers["Accept"]               = "application/vnd.github+json"
        conn.headers["X-GitHub-Api-Version"] = "2026-03-10"
        conn.adapter Faraday.default_adapter
      end
    end
  end
end

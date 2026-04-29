# frozen_string_literal: true

module Oauth
  class GithubCopilotProvider < BaseProvider
    API_URL = "https://api.github.com"

    # Probe billing endpoint to verify manage_billing:copilot scope is active.
    # GET /orgs/{org}/copilot/billing returns 200 with seat summary or
    # 404/403 if Copilot is not enabled / token lacks scope.
    def test_connection
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

    # Fetch seat allocation info from GET /orgs/{org}/copilot/billing/seats
    # Shape: { "total_seats": N, "seats": [{ "assignee": {...}, "last_activity_at": "..." }] }
    def fetch_seats
      org = connector.external_org_name
      response = copilot_client.get("#{API_URL}/orgs/#{org}/copilot/billing/seats")
      return {} unless response.success?
      JSON.parse(response.body)
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

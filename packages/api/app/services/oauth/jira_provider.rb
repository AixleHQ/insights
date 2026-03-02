# frozen_string_literal: true

module Oauth
  class JiraProvider < BaseProvider
    API_URL = "https://api.atlassian.com"

    def test_connection
      # First get accessible resources (cloud instances)
      response = http_client.get("#{API_URL}/oauth/token/accessible-resources")

      if response.success?
        data = JSON.parse(response.body)
        if data.any?
          { success: true, account: data.first["name"], name: data.first["name"] }
        else
          { success: false, error: "No accessible Jira sites found" }
        end
      else
        { success: false, error: "Jira API error: #{response.status}" }
      end
    rescue Faraday::Error => e
      { success: false, error: "Connection error: #{e.message}" }
    end

    def fetch_projects
      # First get the cloud ID
      resources_response = http_client.get("#{API_URL}/oauth/token/accessible-resources")
      return [] unless resources_response.success?

      resources = JSON.parse(resources_response.body)
      return [] if resources.empty?

      cloud_id = resources.first["id"]

      # Then fetch projects
      response = http_client.get("#{API_URL}/ex/jira/#{cloud_id}/rest/api/3/project/search")
      return [] unless response.success?

      data = JSON.parse(response.body)
      data["values"].map do |project|
        {
          external_id: project["id"],
          key: project["key"],
          name: project["name"],
          avatar_url: project.dig("avatarUrls", "48x48")
        }
      end
    end

    class << self
      def client_id
        Rails.application.credentials.dig(:atlassian, :client_id) ||
          ENV.fetch("ATLASSIAN_CLIENT_ID", nil)
      end

      def client_secret
        Rails.application.credentials.dig(:atlassian, :client_secret) ||
          ENV.fetch("ATLASSIAN_CLIENT_SECRET", nil)
      end

      def authorize_endpoint
        "https://auth.atlassian.com/authorize"
      end

      def token_endpoint
        "https://auth.atlassian.com/oauth/token"
      end

      def scopes
        %w[read:jira-user read:jira-work manage:jira-project offline_access]
      end

      def authorization_url(organization_id:, redirect_uri:, state: nil)
        state ||= SecureRandom.hex(32)
        params = {
          audience: "api.atlassian.com",
          client_id: client_id,
          redirect_uri: redirect_uri,
          scope: scopes.join(" "),
          state: "#{organization_id}:#{state}",
          response_type: "code",
          prompt: "consent"
        }
        "#{authorize_endpoint}?#{params.to_query}"
      end

      def fetch_account_info(access_token)
        response = Faraday.get("#{API_URL}/oauth/token/accessible-resources") do |req|
          req.headers["Authorization"] = "Bearer #{access_token}"
          req.headers["Accept"] = "application/json"
        end

        return {} unless response.success?

        data = JSON.parse(response.body)
        return {} if data.empty?

        {
          account_id: data.first["id"],
          account_name: data.first["name"]
        }
      end
    end
  end
end

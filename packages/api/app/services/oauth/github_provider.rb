# frozen_string_literal: true

module Oauth
  class GithubProvider < BaseProvider
    API_URL = "https://api.github.com"

    def test_connection
      response = http_client.get("#{API_URL}/user")

      if response.success?
        data = JSON.parse(response.body)
        { success: true, account: data["login"], name: data["name"] }
      else
        { success: false, error: "GitHub API error: #{response.status}" }
      end
    rescue Faraday::Error => e
      { success: false, error: "Connection error: #{e.message}" }
    end

    def fetch_repositories(page: 1, per_page: 100)
      response = http_client.get("#{API_URL}/user/repos") do |req|
        req.params["page"] = page
        req.params["per_page"] = per_page
        req.params["sort"] = "updated"
      end

      return [] unless response.success?

      JSON.parse(response.body).map do |repo|
        {
          external_id: repo["id"].to_s,
          name: repo["name"],
          full_name: repo["full_name"],
          description: repo["description"],
          default_branch: repo["default_branch"],
          clone_url: repo["clone_url"],
          html_url: repo["html_url"],
          is_private: repo["private"]
        }
      end
    end

    class << self
      def client_id
        Rails.application.credentials.dig(:github, :client_id) ||
          ENV.fetch("GITHUB_CLIENT_ID", nil)
      end

      def client_secret
        Rails.application.credentials.dig(:github, :client_secret) ||
          ENV.fetch("GITHUB_CLIENT_SECRET", nil)
      end

      def authorize_endpoint
        "https://github.com/login/oauth/authorize"
      end

      def token_endpoint
        "https://github.com/login/oauth/access_token"
      end

      def scopes
        %w[read:user repo]
      end

      def fetch_account_info(access_token)
        response = Faraday.get("#{API_URL}/user") do |req|
          req.headers["Authorization"] = "Bearer #{access_token}"
          req.headers["Accept"] = "application/json"
        end

        return {} unless response.success?

        data = JSON.parse(response.body)
        {
          account_id: data["id"].to_s,
          account_name: data["login"]
        }
      end
    end
  end
end

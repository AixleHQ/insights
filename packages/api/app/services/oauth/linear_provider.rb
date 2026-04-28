# frozen_string_literal: true

module Oauth
  class LinearProvider < BaseProvider
    API_URL = "https://api.linear.app"
    GRAPHQL_URL = "#{API_URL}/graphql"

    def test_connection
      query = "{ viewer { id name email } }"
      response = graphql_request(query)

      if response.success?
        data = JSON.parse(response.body)
        if data["data"] && data["data"]["viewer"]
          viewer = data["data"]["viewer"]
          { success: true, account: viewer["email"], name: viewer["name"] }
        else
          { success: false, error: data["errors"]&.first&.dig("message") || "Unknown error" }
        end
      else
        { success: false, error: "Linear API error: #{response.status}" }
      end
    rescue Faraday::Error => e
      { success: false, error: "Connection error: #{e.message}" }
    end

    def fetch_teams
      query = <<~GRAPHQL
        {
          teams {
            nodes {
              id
              name
              key
            }
          }
        }
      GRAPHQL

      response = graphql_request(query)
      return [] unless response.success?

      data = JSON.parse(response.body)
      return [] unless data["data"] && data["data"]["teams"]

      data["data"]["teams"]["nodes"].map do |team|
        {
          external_id: team["id"],
          name: team["name"],
          key: team["key"]
        }
      end
    end

    def fetch_projects
      query = <<~GRAPHQL
        {
          projects {
            nodes {
              id
              name
              state
              teams {
                nodes {
                  id
                  name
                }
              }
            }
          }
        }
      GRAPHQL

      response = graphql_request(query)
      return [] unless response.success?

      data = JSON.parse(response.body)
      return [] unless data["data"] && data["data"]["projects"]

      data["data"]["projects"]["nodes"].map do |project|
        {
          external_id: project["id"],
          name: project["name"],
          state: project["state"],
          teams: project["teams"]["nodes"]
        }
      end
    end

    class << self
      def client_id
        Rails.application.credentials.dig(:linear, :client_id) ||
          ENV.fetch("LINEAR_CLIENT_ID", nil)
      end

      def client_secret
        Rails.application.credentials.dig(:linear, :client_secret) ||
          ENV.fetch("LINEAR_CLIENT_SECRET", nil)
      end

      def authorize_endpoint
        "https://linear.app/oauth/authorize"
      end

      def token_endpoint
        "https://api.linear.app/oauth/token"
      end

      def scopes
        %w[read write]
      end

      def fetch_account_info(access_token)
        response = Faraday.post(GRAPHQL_URL) do |req|
          req.headers["Authorization"] = "Bearer #{access_token}"
          req.headers["Content-Type"] = "application/json"
          req.body = { query: "{ viewer { id email name } }" }.to_json
        end

        return {} unless response.success?

        data = JSON.parse(response.body)
        return {} unless data["data"] && data["data"]["viewer"]

        viewer = data["data"]["viewer"]
        {
          account_id: viewer["id"],
          account_name: viewer["email"]
        }
      end
    end

    private

    def graphql_request(query, variables: {})
      Faraday.post(GRAPHQL_URL) do |req|
        req.headers["Authorization"] = "Bearer #{connector.access_token}"
        req.headers["Content-Type"] = "application/json"
        req.body = { query: query, variables: variables }.to_json
      end
    end
  end
end

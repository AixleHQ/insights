# frozen_string_literal: true

module Oauth
  class LinearProvider < BaseProvider
    API_URL = "https://api.linear.app"
    GRAPHQL_URL = "#{API_URL}/graphql"

    def test_connection
      ensure_fresh_token!
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
      ensure_fresh_token!
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
      ensure_fresh_token!
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

    def fetch_cycles(team_id: nil)
      ensure_fresh_token!
      filter = team_id.present? ? { team: { id: { eq: team_id } } } : nil

      query = <<~GRAPHQL
        query($filter: CycleFilter) {
          cycles(filter: $filter) {
            nodes {
              id
              number
              name
              startsAt
              endsAt
              team {
                id
                name
                key
              }
            }
          }
        }
      GRAPHQL

      data = graphql_data(query, variables: { filter: filter })
      return [] unless data.dig("cycles", "nodes")

      data["cycles"]["nodes"].map do |cycle|
        {
          external_id: cycle["id"],
          number: cycle["number"],
          name: cycle["name"],
          starts_at: cycle["startsAt"],
          ends_at: cycle["endsAt"],
          team_id: cycle.dig("team", "id"),
          team_name: cycle.dig("team", "name"),
          team_key: cycle.dig("team", "key")
        }
      end
    end

    def fetch_issues(updated_after: nil, team_ids: [], project_ids: [])
      ensure_fresh_token!
      filter = {}
      filter[:updatedAt] = { gte: updated_after.iso8601 } if updated_after.present?
      filter[:team] = { id: { in: Array(team_ids) } } if team_ids.present?
      filter[:project] = { id: { in: Array(project_ids) } } if project_ids.present?

      query = <<~GRAPHQL
        query($first: Int!, $after: String, $filter: IssueFilter) {
          issues(first: $first, after: $after, filter: $filter) {
            nodes {
              id
              identifier
              title
              priority
              createdAt
              updatedAt
              completedAt
              canceledAt
              state {
                id
                name
                type
              }
              team {
                id
                name
                key
              }
              project {
                id
                name
              }
              cycle {
                id
                name
                number
              }
              assignee {
                id
                name
                email
              }
              creator {
                id
                name
                email
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      GRAPHQL

      issues = []
      cursor = nil
      pages_fetched = 0
      max_pages = ENV.fetch("LINEAR_MAX_PAGES", 200).to_i

      loop do
        data = graphql_data(query, variables: { first: 50, after: cursor, filter: filter.presence })
        issue_nodes = data.dig("issues", "nodes") || []
        issues.concat(issue_nodes.map { |issue| map_issue(issue) })

        pages_fetched += 1

        page_info = data.dig("issues", "pageInfo") || {}
        break unless page_info["hasNextPage"]
        break if pages_fetched >= max_pages

        cursor = page_info["endCursor"]
        break if cursor.blank?
      end

      issues
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

    def map_issue(issue)
      {
        external_id: issue["id"],
        identifier: issue["identifier"],
        title: issue["title"],
        priority: issue["priority"],
        created_at: issue["createdAt"],
        updated_at: issue["updatedAt"],
        completed_at: issue["completedAt"],
        canceled_at: issue["canceledAt"],
        state_id: issue.dig("state", "id"),
        state_name: issue.dig("state", "name"),
        state_type: issue.dig("state", "type"),
        team_id: issue.dig("team", "id"),
        team_name: issue.dig("team", "name"),
        team_key: issue.dig("team", "key"),
        project_id: issue.dig("project", "id"),
        project_name: issue.dig("project", "name"),
        cycle_id: issue.dig("cycle", "id"),
        cycle_name: issue.dig("cycle", "name"),
        cycle_number: issue.dig("cycle", "number"),
        assignee_id: issue.dig("assignee", "id"),
        assignee_name: issue.dig("assignee", "name"),
        assignee_email: issue.dig("assignee", "email"),
        creator_id: issue.dig("creator", "id"),
        creator_name: issue.dig("creator", "name"),
        creator_email: issue.dig("creator", "email")
      }
    end

    def graphql_data(query, variables: {})
      response = graphql_request(query, variables: variables.compact)

      unless response.success?
        raise LinearApiError, "Linear API HTTP #{response.status}: #{response.body.truncate(200)}"
      end

      body = JSON.parse(response.body)

      if body["errors"].present?
        messages = body["errors"].filter_map { |e| e["message"] }.join(", ")
        raise LinearApiError, "Linear GraphQL error: #{messages}"
      end

      body["data"] || {}
    end

    def graphql_client
      @graphql_client ||= Faraday.new(GRAPHQL_URL) do |conn|
        conn.headers["Authorization"] = "Bearer #{connector.access_token}"
        conn.headers["Content-Type"] = "application/json"
        conn.adapter Faraday.default_adapter
      end
    end

    def reset_http_client!
      super
      @graphql_client = nil
    end

    def graphql_request(query, variables: {})
      graphql_client.post do |req|
        req.body = { query: query, variables: variables }.to_json
      end
    end
  end
end

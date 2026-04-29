# frozen_string_literal: true

module Oauth
  class GitlabProvider < BaseProvider
    API_URL = "https://gitlab.com/api/v4"

    def test_connection
      response = http_client.get("#{API_URL}/user")

      if response.success?
        data = JSON.parse(response.body)
        { success: true, account: data["username"], name: data["name"] }
      else
        { success: false, error: "GitLab API error: #{response.status}" }
      end
    rescue Faraday::Error => e
      { success: false, error: "Connection error: #{e.message}" }
    end

    def fetch_repositories(page: 1, per_page: 100)
      response = http_client.get("#{API_URL}/projects") do |req|
        req.params["page"] = page
        req.params["per_page"] = per_page
        req.params["membership"] = true
        req.params["order_by"] = "updated_at"
      end

      return [] unless response.success?

      JSON.parse(response.body).map do |repo|
        {
          external_id: repo["id"].to_s,
          name: repo["name"],
          full_name: repo["path_with_namespace"],
          description: repo["description"],
          default_branch: repo["default_branch"],
          clone_url: repo["http_url_to_repo"],
          html_url: repo["web_url"],
          is_private: repo["visibility"] == "private"
        }
      end
    end

    def fetch_merge_requests(project_id, updated_after:, page: 1, per_page: 100)
      response = http_client.get("#{API_URL}/projects/#{project_id}/merge_requests") do |req|
        req.params["page"] = page
        req.params["per_page"] = per_page
        req.params["scope"] = "all"
        req.params["state"] = "all"
        req.params["updated_after"] = updated_after.iso8601
        req.params["order_by"] = "updated_at"
        req.params["sort"] = "desc"
      end

      return [] unless response.success?

      JSON.parse(response.body).map do |mr|
        {
          iid: mr["iid"],
          title: mr["title"],
          state: mr["state"],
          updated_at: mr["updated_at"],
          web_url: mr["web_url"],
          author_username: mr.dig("author", "username")
        }
      end
    end

    def fetch_pipelines(project_id, updated_after:, page: 1, per_page: 100)
      response = http_client.get("#{API_URL}/projects/#{project_id}/pipelines") do |req|
        req.params["page"] = page
        req.params["per_page"] = per_page
        req.params["updated_after"] = updated_after.iso8601
        req.params["order_by"] = "updated_at"
        req.params["sort"] = "desc"
      end

      return [] unless response.success?

      JSON.parse(response.body).map do |pipeline|
        {
          id: pipeline["id"],
          status: pipeline["status"],
          ref: pipeline["ref"],
          updated_at: pipeline["updated_at"] || pipeline["created_at"],
          web_url: pipeline["web_url"],
          sha: pipeline["sha"]
        }
      end
    end

    def fetch_commits(project_id, ref_name:, since:, page: 1, per_page: 100)
      response = http_client.get("#{API_URL}/projects/#{project_id}/repository/commits") do |req|
        req.params["page"] = page
        req.params["per_page"] = per_page
        req.params["ref_name"] = ref_name if ref_name.present?
        req.params["since"] = since.iso8601
        req.params["all"] = true
      end

      return [] unless response.success?

      JSON.parse(response.body).map do |commit|
        {
          "id" => commit["id"],
          "message" => commit["message"],
          "timestamp" => commit["committed_date"] || commit["created_at"],
          "url" => commit["web_url"],
          "author" => {
            "name" => commit["author_name"],
            "email" => commit["author_email"]
          }
        }
      end
    end

    class << self
      def client_id
        Rails.application.credentials.dig(:gitlab, :client_id) ||
          ENV.fetch("GITLAB_CLIENT_ID", nil)
      end

      def client_secret
        Rails.application.credentials.dig(:gitlab, :client_secret) ||
          ENV.fetch("GITLAB_CLIENT_SECRET", nil)
      end

      def authorize_endpoint
        "https://gitlab.com/oauth/authorize"
      end

      def token_endpoint
        "https://gitlab.com/oauth/token"
      end

      def scopes
        %w[read_user read_api read_repository]
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
          account_name: data["username"]
        }
      end
    end
  end
end

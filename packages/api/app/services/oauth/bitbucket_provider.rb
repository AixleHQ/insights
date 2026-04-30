# frozen_string_literal: true

module Oauth
  class BitbucketProvider < BaseProvider
    API_URL = "https://api.bitbucket.org/2.0"

    def test_connection
      response = http_client.get("#{API_URL}/user")

      if response.success?
        data = JSON.parse(response.body)
        { success: true, account: data["username"], name: data["display_name"] }
      else
        { success: false, error: "Bitbucket API error: #{response.status}" }
      end
    rescue Faraday::Error => e
      { success: false, error: "Connection error: #{e.message}" }
    end

    def fetch_repositories(page: 1, per_page: 100)
      fetch_workspaces(page: page, per_page: per_page).flat_map do |workspace|
        fetch_workspace_repositories(workspace, page: page, per_page: per_page)
      end
    end

    def fetch_pull_requests(workspace, repo_slug, updated_after:, page: 1, per_page: 100)
      response = http_client.get("#{API_URL}/repositories/#{workspace}/#{repo_slug}/pullrequests") do |req|
        req.params["page"] = page
        req.params["pagelen"] = per_page
        req.params["state"] = "OPEN,MERGED,DECLINED,SUPERSEDED"
        req.params["sort"] = "-updated_on"
        req.params["q"] = %(updated_on >= "#{updated_after.utc.iso8601}")
      end

      return [] unless response.success?

      JSON.parse(response.body).fetch("values", []).map do |pull_request|
        {
          id: pull_request["id"],
          title: pull_request["title"],
          state: pull_request["state"],
          updated_at: pull_request["updated_on"],
          web_url: pull_request.dig("links", "html", "href"),
          author_username: pull_request.dig("author", "nickname") || pull_request.dig("author", "display_name")
        }
      end
    end

    def fetch_pipelines(workspace, repo_slug, updated_after:, page: 1, per_page: 100)
      response = http_client.get("#{API_URL}/repositories/#{workspace}/#{repo_slug}/pipelines") do |req|
        req.params["page"] = page
        req.params["pagelen"] = per_page
        req.params["sort"] = "-created_on"
        req.params["q"] = %(created_on >= "#{updated_after.utc.iso8601}")
      end

      return [] unless response.success?

      JSON.parse(response.body).fetch("values", []).map do |pipeline|
        {
          id: pipeline["uuid"] || pipeline["build_number"] || pipeline["created_on"],
          status: pipeline.dig("state", "name"),
          ref: pipeline.dig("target", "ref_name") || pipeline.dig("target", "ref_type"),
          updated_at: pipeline["completed_on"] || pipeline["created_on"],
          web_url: pipeline.dig("links", "html", "href"),
          sha: pipeline.dig("target", "commit", "hash")
        }
      end
    end

    def fetch_commits(workspace, repo_slug, branch:, since:, page: 1, per_page: 100)
      response = http_client.get("#{API_URL}/repositories/#{workspace}/#{repo_slug}/commits/#{branch}") do |req|
        req.params["page"] = page
        req.params["pagelen"] = per_page
        req.params["include"] = branch
      end

      return [] unless response.success?

      JSON.parse(response.body).fetch("values", []).filter_map do |commit|
        commit_time = Time.zone.parse(commit["date"])
        next if commit_time.blank? || commit_time < since

        {
          "id" => commit["hash"],
          "message" => commit["message"],
          "timestamp" => commit["date"],
          "url" => commit.dig("links", "html", "href"),
          "author" => {
            "name" => commit.dig("author", "user", "display_name") || commit.dig("author", "raw")&.split("<")&.first&.strip,
            "email" => extract_email(commit.dig("author", "raw"))
          }
        }
      end
    end

    class << self
      def authorization_url(organization_id:, redirect_uri:, state: nil)
        id = client_id
        if id.blank?
          raise Oauth::MissingCredentialsError,
                "#{provider_display_name} integration is not configured (missing client_id)"
        end

        state ||= SecureRandom.hex(32)
        params = {
          client_id: id,
          redirect_uri: redirect_uri,
          state: "#{organization_id}:#{state}",
          response_type: "code"
        }
        "#{authorize_endpoint}?#{params.to_query}"
      end

      def client_id
        Rails.application.credentials.dig(:bitbucket, :client_id) ||
          ENV.fetch("BITBUCKET_CLIENT_ID", nil)
      end

      def client_secret
        Rails.application.credentials.dig(:bitbucket, :client_secret) ||
          ENV.fetch("BITBUCKET_CLIENT_SECRET", nil)
      end

      def authorize_endpoint
        "https://bitbucket.org/site/oauth2/authorize"
      end

      def token_endpoint
        "https://bitbucket.org/site/oauth2/access_token"
      end

      def scopes
        %w[account repository pullrequest pipeline]
      end

      def fetch_account_info(access_token)
        response = Faraday.get("#{API_URL}/user") do |req|
          req.headers["Authorization"] = "Bearer #{access_token}"
          req.headers["Accept"] = "application/json"
        end

        return {} unless response.success?

        data = JSON.parse(response.body)
        {
          account_id: data["uuid"],
          account_name: data["username"]
        }
      end
    end

    private

    def fetch_workspaces(page:, per_page:)
      response = http_client.get("#{API_URL}/user/workspaces") do |req|
        req.params["page"] = page
        req.params["pagelen"] = per_page
      end

      return [] unless response.success?

      JSON.parse(response.body).fetch("values", []).filter_map do |workspace_access|
        workspace_access.dig("workspace", "slug")
      end
    end

    def fetch_workspace_repositories(workspace, page:, per_page:)
      response = http_client.get("#{API_URL}/repositories/#{workspace}") do |req|
        req.params["page"] = page
        req.params["pagelen"] = per_page
        req.params["sort"] = "-updated_on"
      end

      return [] unless response.success?

      JSON.parse(response.body).fetch("values", []).map do |repo|
        {
          external_id: repo["uuid"],
          name: repo["name"],
          full_name: repo["full_name"],
          description: repo["description"],
          default_branch: repo.dig("mainbranch", "name") || "main",
          clone_url: repo.dig("links", "clone")&.find { |l| l["name"] == "https" }&.dig("href"),
          html_url: repo.dig("links", "html", "href"),
          is_private: repo["is_private"]
        }
      end
    end

    def extract_email(raw_author)
      return nil if raw_author.blank?

      match = raw_author.match(/<(.+)>/)
      match ? match[1].downcase : nil
    end
  end
end

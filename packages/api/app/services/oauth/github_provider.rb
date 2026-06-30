# frozen_string_literal: true

module Oauth
  class GithubProvider < BaseProvider
    API_URL = "https://api.github.com"

    # Commit identifiers must be plain hex — anything else would let a
    # client-supplied value reshape the request path (AIX-261 review).
    COMMIT_SHA_PATTERN = /\A\h{4,64}\z/

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

      unless response.success?
        raise Oauth::GithubApiError, "GitHub repos lookup failed (#{response.status})"
      end

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

    # Lists commits on the default branch (or +branch+) since +since+.
    # Maps each GitHub API commit to the same shape as webhook push payloads for GithubSyncJob.
    def fetch_commits(full_name, branch:, since:, per_page: 100, max_pages: 5)
      ensure_fresh_token!

      owner, repo = full_name.to_s.split("/", 2)
      return [] if owner.blank? || repo.blank?

      all = []
      page = 1
      loop do
        response = http_client.get("#{API_URL}/repos/#{owner}/#{repo}/commits") do |req|
          req.params[:sha] = branch if branch.present?
          req.params[:since] = since.iso8601 if since
          req.params[:per_page] = per_page
          req.params[:page] = page
        end

        break unless response.success?

        batch = JSON.parse(response.body)
        break if batch.empty?

        batch.each { |c| all << normalize_commit_payload(c) }

        break if batch.size < per_page

        page += 1
        break if page > max_pages
      end

      all
    end

    # Pull requests associated with a commit (PR correlation, AIX-261).
    # Raises Oauth::GithubApiError on non-success so Sidekiq can retry —
    # callers must not cache failures.
    def fetch_pull_requests_for_commit(full_name, sha)
      ensure_fresh_token!

      owner, repo = full_name.to_s.split("/", 2)
      raise ArgumentError, "malformed repository full_name: #{full_name.inspect}" if owner.blank? || repo.blank?
      raise ArgumentError, "malformed commit sha: #{sha.inspect}" unless sha.to_s.match?(COMMIT_SHA_PATTERN)

      response = http_client.get("#{API_URL}/repos/#{owner}/#{repo}/commits/#{sha}/pulls")
      unless response.success?
        raise Oauth::GithubApiError, "GitHub commit-pulls lookup failed (#{response.status}) for #{full_name}@#{sha}"
      end

      pulls = begin
        JSON.parse(response.body)
      rescue JSON::ParserError
        raise Oauth::GithubApiError, "GitHub commit-pulls returned an unparseable body for #{full_name}@#{sha}"
      end
      unless pulls.is_a?(Array)
        raise Oauth::GithubApiError, "GitHub commit-pulls returned a non-array body for #{full_name}@#{sha}"
      end

      pulls
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

    private

    def normalize_commit_payload(api_commit)
      sha = api_commit["sha"]
      commit_obj = api_commit["commit"] || {}
      author = commit_obj["author"] || {}
      timestamp = author["date"].presence || commit_obj.dig("committer", "date")
      {
        "id" => sha,
        "timestamp" => timestamp,
        "message" => commit_obj["message"],
        "author" => {
          "name" => author["name"],
          "email" => author["email"]
        },
        "url" => api_commit["html_url"]
      }
    end
  end
end

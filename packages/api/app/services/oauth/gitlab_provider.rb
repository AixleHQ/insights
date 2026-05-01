# frozen_string_literal: true

module Oauth
  class GitlabProvider < BaseProvider
    API_URL = "https://gitlab.com/api/v4"

    # Maximum number of pages fetched per endpoint per repo.
    # Prevents unbounded pagination on very active projects.
    # Override with GITLAB_MAX_PAGES env var (0 = unlimited).
    MAX_PAGES_DEFAULT = 20

    # Optional inter-page delay in milliseconds to smooth burst traffic.
    # Override with GITLAB_PAGE_DELAY_MS env var.
    PAGE_DELAY_MS_DEFAULT = 0

    # Retry settings for 429 / transient errors (503).
    RETRY_MAX_ATTEMPTS = 3
    RETRY_STATUSES = [ 429, 503 ].freeze

    def test_connection
      ensure_fresh_token!
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

    # When all_pages: true, walks every GitLab page (X-Next-Page) - used by GitlabSyncJob.
    # When all_pages: false, a single request with page/per_page - used by available_repos API.
    def fetch_repositories(all_pages: false, page: 1, per_page: 100)
      ensure_fresh_token!
      rows =
        if all_pages
          gitlab_json_pages(per_page) do |page_num|
            http_client.get("#{API_URL}/projects") do |req|
              req.params["page"] = page_num
              req.params["per_page"] = per_page
              req.params["membership"] = true
              req.params["order_by"] = "updated_at"
            end
          end
        else
          response = http_client.get("#{API_URL}/projects") do |req|
            req.params["page"] = page
            req.params["per_page"] = per_page
            req.params["membership"] = true
            req.params["order_by"] = "updated_at"
          end
          return [] unless response.success?

          JSON.parse(response.body)
        end

      map_gitlab_repository_rows(rows)
    end

    def fetch_merge_requests(project_id, updated_after:, per_page: 100)
      ensure_fresh_token!
      rows = gitlab_json_pages(per_page) do |page|
        http_client.get("#{API_URL}/projects/#{project_id}/merge_requests") do |req|
          req.params["page"] = page
          req.params["per_page"] = per_page
          req.params["scope"] = "all"
          req.params["state"] = "all"
          req.params["updated_after"] = updated_after.iso8601
          req.params["order_by"] = "updated_at"
          req.params["sort"] = "desc"
        end
      end

      rows.map do |mr|
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

    def fetch_pipelines(project_id, updated_after:, per_page: 100)
      ensure_fresh_token!
      rows = gitlab_json_pages(per_page) do |page|
        http_client.get("#{API_URL}/projects/#{project_id}/pipelines") do |req|
          req.params["page"] = page
          req.params["per_page"] = per_page
          req.params["updated_after"] = updated_after.iso8601
          req.params["order_by"] = "updated_at"
          req.params["sort"] = "desc"
        end
      end

      rows.map do |pipeline|
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

    # GitLab uses the project's default branch when `ref_name` is omitted; we only send it when present.
    # `all=true` widens results to commits reachable across refs (not just the single-branch history of
    # `ref_name`). Deliberate tradeoff for connector sync; tighten here if we ever need strict default-branch-only slices.
    def fetch_commits(project_id, ref_name:, since:, per_page: 100)
      ensure_fresh_token!
      rows = gitlab_json_pages(per_page) do |page|
        http_client.get("#{API_URL}/projects/#{project_id}/repository/commits") do |req|
          req.params["page"] = page
          req.params["per_page"] = per_page
          req.params["ref_name"] = ref_name if ref_name.present?
          req.params["since"] = since.iso8601
          req.params["all"] = true
        end
      end

      rows.map do |commit|
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

    private

    def map_gitlab_repository_rows(repos)
      repos.map do |repo|
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

    # GitLab paginates with X-Next-Page / X-Total-Pages; loop until X-Next-Page is blank.
    def gitlab_next_page_number(response)
      value = response.headers["x-next-page"]
      return nil if value.nil? || value.to_s.strip.empty?

      value.to_i
    end

    # Yields page index (1-based), concatenates JSON array bodies until no next page.
    # Stops after gitlab_max_pages pages (0 = unlimited).
    # Applies an optional inter-page delay to smooth GitLab rate-limit burst.
    # First-page HTTP failure returns []. Later-page failure returns rows collected so far.
    def gitlab_json_pages(_per_page)
      max_pages  = ENV.fetch("GITLAB_MAX_PAGES", MAX_PAGES_DEFAULT).to_i
      delay_ms   = ENV.fetch("GITLAB_PAGE_DELAY_MS", PAGE_DELAY_MS_DEFAULT).to_i
      page       = 1
      rows       = []

      loop do
        response = yield(page)
        unless response.success?
          break if page > 1
          return []
        end

        batch = JSON.parse(response.body)
        break if batch.empty?

        rows.concat(batch)

        break if max_pages > 0 && page >= max_pages

        next_page = gitlab_next_page_number(response)
        break if next_page.nil? || next_page <= page

        sleep(delay_ms / 1000.0) if delay_ms > 0
        page = next_page
      end

      rows
    end

    # Build a Faraday connection with retry logic for GitLab-specific rate limiting.
    # Reads Retry-After header on 429 to determine sleep duration.
    # Retries up to RETRY_MAX_ATTEMPTS times on 429 and 503.
    def http_client
      @http_client ||= Faraday.new do |conn|
        conn.headers["Authorization"] = "Bearer #{connector.access_token}"
        conn.headers["Accept"]        = "application/json"
        conn.use(GitlabRateLimitMiddleware)
        conn.adapter Faraday.default_adapter
      end
    end

    # Faraday middleware that retries on 429 (rate limit) and 503 (transient error).
    # Honors the Retry-After response header when present (value in seconds).
    # Falls back to exponential backoff: 1s, 2s, 4s, …
    class GitlabRateLimitMiddleware < Faraday::Middleware
      def call(env)
        attempt = 0
        loop do
          response = @app.call(env.dup)

          retryable = GitlabProvider::RETRY_STATUSES.include?(response.status)
          if retryable && attempt < GitlabProvider::RETRY_MAX_ATTEMPTS
            attempt += 1
            wait = retry_after_seconds(response) || (2**(attempt - 1))
            Rails.logger.warn(
              "[GitlabProvider] HTTP #{response.status} — retrying in #{wait}s " \
              "(attempt #{attempt}/#{GitlabProvider::RETRY_MAX_ATTEMPTS})"
            )
            sleep(wait)
            next
          end

          return response
        end
      end

      private

      def retry_after_seconds(response)
        value = response.headers["retry-after"] || response.headers["Retry-After"]
        return nil if value.nil?

        value.to_f.positive? ? value.to_f : nil
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

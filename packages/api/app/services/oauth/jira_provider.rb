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
      id = cloud_id
      return [] if id.nil?

      response = http_client.get("#{API_URL}/ex/jira/#{id}/rest/api/3/project/search")
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

    def fetch_issues(project_key, max_results: 100, next_page_token: nil)
      jql = "project = \"#{project_key}\" ORDER BY updated DESC"
      body = {
        jql: jql,
        maxResults: max_results,
        fields: %w[summary status issuetype priority assignee reporter parent labels duedate created updated project]
      }
      body[:nextPageToken] = next_page_token if next_page_token

      response = http_client.post("#{API_URL}/ex/jira/#{cloud_id}/rest/api/3/search/jql") do |req|
        req.headers["Content-Type"] = "application/json"
        req.body = body.to_json
      end
      return { issues: [], total: 0 } unless response.success?

      data = JSON.parse(response.body)
      issues = data["issues"].map { |i| map_issue(i) }
      { issues: issues, total: data["total"] || issues.size, next_page_token: data["nextPageToken"] }
    end

    def map_issue(raw)
      fields = raw["fields"]
      {
        external_id:         raw["id"],
        key:                 raw["key"],
        summary:             fields["summary"],
        status:              fields.dig("status", "name"),
        status_category:     fields.dig("status", "statusCategory", "key"),
        issue_type:          fields.dig("issuetype", "name"),
        priority:            fields.dig("priority", "name"),
        assignee_account_id: fields.dig("assignee", "accountId"),
        assignee_name:       fields.dig("assignee", "displayName"),
        reporter_name:       fields.dig("reporter", "displayName"),
        jira_project_key:    fields.dig("project", "key"),
        jira_project_id:     fields.dig("project", "id"),
        parent_key:          fields.dig("parent", "key"),
        labels:              fields["labels"] || [],
        due_date:            fields["duedate"],
        external_created_at: fields["created"],
        external_updated_at: fields["updated"]
      }
    end

    def fetch_user_email(account_id)
      id = cloud_id
      return nil if id.nil? || account_id.blank?

      response = http_client.get(
        "#{API_URL}/ex/jira/#{id}/rest/api/3/user",
        params: { accountId: account_id }
      )
      return nil unless response.success?

      JSON.parse(response.body)["emailAddress"]
    rescue StandardError
      nil
    end

    private

    def cloud_id
      return @cloud_id if instance_variable_defined?(:@cloud_id)

      response = http_client.get("#{API_URL}/oauth/token/accessible-resources")
      @cloud_id = if response.success?
        JSON.parse(response.body).first&.dig("id")
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

      # exchange_code is inherited from BaseProvider which validates both client_id and client_secret.
      # If this method is ever overridden here, add the credential guard.
      def authorization_url(organization_id:, redirect_uri:, state: nil)
        id = client_id
        if id.blank?
          raise Oauth::MissingCredentialsError,
                "#{provider_display_name} integration is not configured (missing client_id)"
        end

        state ||= SecureRandom.hex(32)
        params = {
          audience: "api.atlassian.com",
          client_id: id,
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

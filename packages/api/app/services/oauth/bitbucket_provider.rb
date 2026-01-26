# frozen_string_literal: true

module Oauth
  class BitbucketProvider < BaseProvider
    API_URL = 'https://api.bitbucket.org/2.0'

    def test_connection
      response = http_client.get("#{API_URL}/user")

      if response.success?
        data = JSON.parse(response.body)
        { success: true, account: data['username'], name: data['display_name'] }
      else
        { success: false, error: "Bitbucket API error: #{response.status}" }
      end
    rescue Faraday::Error => e
      { success: false, error: "Connection error: #{e.message}" }
    end

    def fetch_repositories(page: 1, per_page: 100)
      # Bitbucket uses page numbers starting from 1
      response = http_client.get("#{API_URL}/repositories") do |req|
        req.params['page'] = page
        req.params['pagelen'] = per_page
        req.params['role'] = 'member'
        req.params['sort'] = '-updated_on'
      end

      return [] unless response.success?

      data = JSON.parse(response.body)
      data['values'].map do |repo|
        {
          external_id: repo['uuid'],
          name: repo['name'],
          full_name: repo['full_name'],
          description: repo['description'],
          default_branch: repo.dig('mainbranch', 'name') || 'main',
          clone_url: repo.dig('links', 'clone')&.find { |l| l['name'] == 'https' }&.dig('href'),
          html_url: repo.dig('links', 'html', 'href'),
          is_private: repo['is_private']
        }
      end
    end

    class << self
      def client_id
        Rails.application.credentials.dig(:bitbucket, :client_id) ||
          ENV.fetch('BITBUCKET_CLIENT_ID', nil)
      end

      def client_secret
        Rails.application.credentials.dig(:bitbucket, :client_secret) ||
          ENV.fetch('BITBUCKET_CLIENT_SECRET', nil)
      end

      def authorize_endpoint
        'https://bitbucket.org/site/oauth2/authorize'
      end

      def token_endpoint
        'https://bitbucket.org/site/oauth2/access_token'
      end

      def scopes
        %w[account repository]
      end

      def fetch_account_info(access_token)
        response = Faraday.get("#{API_URL}/user") do |req|
          req.headers['Authorization'] = "Bearer #{access_token}"
          req.headers['Accept'] = 'application/json'
        end

        return {} unless response.success?

        data = JSON.parse(response.body)
        {
          account_id: data['uuid'],
          account_name: data['username']
        }
      end
    end
  end
end

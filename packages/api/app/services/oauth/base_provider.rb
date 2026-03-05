# frozen_string_literal: true

module Oauth
  class BaseProvider
    attr_reader :connector

    PROVIDER_MAP = {
      "github" => "Oauth::GithubProvider",
      "gitlab" => "Oauth::GitlabProvider",
      "bitbucket" => "Oauth::BitbucketProvider",
      "jira" => "Oauth::JiraProvider",
      "linear" => "Oauth::LinearProvider",
      "anthropic" => "Oauth::AnthropicProvider",
      "openai" => "Oauth::OpenaiProvider",
      "openrouter" => "Oauth::OpenrouterProvider",
      "gemini" => "Oauth::GeminiProvider"
    }.freeze

    def self.for(connector)
      provider_class(connector.connector_type).new(connector)
    end

    def self.provider_class(connector_type)
      class_name = PROVIDER_MAP[connector_type]
      raise NotImplementedError, "Unknown connector type: #{connector_type}" unless class_name

      class_name.constantize
    end

    def initialize(connector)
      @connector = connector
    end

    def self.authorization_url(organization_id:, redirect_uri:, state: nil)
      state ||= SecureRandom.hex(32)
      params = {
        client_id: client_id,
        redirect_uri: redirect_uri,
        scope: scopes.join(" "),
        state: "#{organization_id}:#{state}",
        response_type: "code"
      }
      "#{authorize_endpoint}?#{params.to_query}"
    end

    def self.exchange_code(code, redirect_uri:)
      response = Faraday.post(token_endpoint) do |req|
        req.headers["Accept"] = "application/json"
        req.headers["Content-Type"] = "application/x-www-form-urlencoded"
        req.body = {
          client_id: client_id,
          client_secret: client_secret,
          code: code,
          redirect_uri: redirect_uri,
          grant_type: "authorization_code"
        }
      end

      data = JSON.parse(response.body)
      raise "OAuth error: #{data['error_description'] || data['error']}" if data["error"]

      token_data = {
        access_token: data["access_token"],
        refresh_token: data["refresh_token"],
        expires_at: data["expires_in"] ? Time.current + data["expires_in"].to_i.seconds : nil
      }

      # Fetch account info
      account_info = fetch_account_info(token_data[:access_token])
      token_data.merge(account_info)
    end

    def test_connection
      raise NotImplementedError, "Subclass must implement test_connection"
    end

    def refresh_token!
      return false unless connector.refresh_token.present?

      response = Faraday.post(self.class.token_endpoint) do |req|
        req.headers["Accept"] = "application/json"
        req.headers["Content-Type"] = "application/x-www-form-urlencoded"
        req.body = {
          client_id: self.class.client_id,
          client_secret: self.class.client_secret,
          refresh_token: connector.refresh_token,
          grant_type: "refresh_token"
        }
      end

      data = JSON.parse(response.body)
      return false if data["error"]

      connector.update!(
        access_token: data["access_token"],
        refresh_token: data["refresh_token"] || connector.refresh_token,
        token_expires_at: data["expires_in"] ? Time.current + data["expires_in"].to_i.seconds : nil
      )

      true
    end

    class << self
      def client_id
        raise NotImplementedError
      end

      def client_secret
        raise NotImplementedError
      end

      def authorize_endpoint
        raise NotImplementedError
      end

      def token_endpoint
        raise NotImplementedError
      end

      def scopes
        raise NotImplementedError
      end

      def fetch_account_info(_access_token)
        raise NotImplementedError
      end
    end

    protected

    def http_client
      @http_client ||= Faraday.new do |conn|
        conn.headers["Authorization"] = "Bearer #{connector.access_token}"
        conn.headers["Accept"] = "application/json"
        conn.adapter Faraday.default_adapter
      end
    end
  end
end

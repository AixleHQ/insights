# Keycloak Configuration
#
# Environment variables:
#   KEYCLOAK_URL          - Keycloak server URL (default: http://localhost:8080)
#   KEYCLOAK_EXTERNAL_URL - Public Keycloak URL for browser redirects (falls back to KEYCLOAK_ISSUER or KEYCLOAK_URL)
#   KEYCLOAK_REALM        - Keycloak realm name (default: db90)
#   KEYCLOAK_AUDIENCE     - Expected JWT audience / client ID (default: db90-web)
#   KEYCLOAK_ISSUER       - JWT issuer URL (auto-generated from URL + realm)
#   KEYCLOAK_JWKS_URI     - JWKS endpoint URL (auto-generated from issuer)

# Explicitly require JwtAuth middleware before Rails autoloading
require_relative "../../app/middleware/jwt_auth"

module Keycloak
  class Configuration
    attr_accessor :url, :realm, :audience, :issuer, :jwks_uri

    def initialize
      @url = ENV.fetch("KEYCLOAK_URL", "http://localhost:8080")
      @realm = ENV.fetch("KEYCLOAK_REALM", "db90")
      @audience = ENV.fetch("KEYCLOAK_AUDIENCE", "db90-web")
      @issuer = ENV.fetch("KEYCLOAK_ISSUER") { "#{@url}/realms/#{@realm}" }
      @jwks_uri = ENV.fetch("KEYCLOAK_JWKS_URI") { "#{@issuer}/protocol/openid-connect/certs" }
    end

    # Browser-facing URL (for OIDC redirects).
    # In Docker/ECS the internal hostname differs from the public one.
    def external_url
      @external_url ||= if ENV["KEYCLOAK_EXTERNAL_URL"].present?
        ENV["KEYCLOAK_EXTERNAL_URL"]
      elsif ENV["KEYCLOAK_ISSUER"].present?
        ENV["KEYCLOAK_ISSUER"].sub(%r{/realms/.*}, "")
      else
        url
      end
    end

    # Server-to-server URL (for token exchange, JWKS fetch).
    def internal_url
      @internal_url ||= if ENV["KEYCLOAK_JWKS_URI"].present?
        URI(ENV["KEYCLOAK_JWKS_URI"]).then { |u| "#{u.scheme}://#{u.host}:#{u.port}" }
      else
        url
      end
    end

    def authorize_url
      "#{external_url}/realms/#{realm}/protocol/openid-connect/auth"
    end

    def token_url
      "#{issuer}/protocol/openid-connect/token"
    end

    def internal_token_url
      "#{internal_url}/realms/#{realm}/protocol/openid-connect/token"
    end

    def openid_config_url
      "#{issuer}/.well-known/openid-configuration"
    end

    def userinfo_url
      "#{issuer}/protocol/openid-connect/userinfo"
    end

    def logout_url
      "#{issuer}/protocol/openid-connect/logout"
    end

    # Browser-facing RP-initiated logout (end session) endpoint.
    # Uses external_url so the redirect resolves from the user's browser.
    def end_session_url
      "#{external_url}/realms/#{realm}/protocol/openid-connect/logout"
    end
  end

  class << self
    def configuration
      @configuration ||= Configuration.new
    end

    def configure
      yield(configuration)
    end

    def reset_configuration!
      @configuration = Configuration.new
    end
  end
end

# Insert JWT auth middleware
Rails.application.config.middleware.use JwtAuth

# Log configuration in development
if Rails.env.development?
  Rails.logger.info "[Keycloak] URL: #{Keycloak.configuration.url}"
  Rails.logger.info "[Keycloak] Realm: #{Keycloak.configuration.realm}"
  Rails.logger.info "[Keycloak] Issuer: #{Keycloak.configuration.issuer}"
end

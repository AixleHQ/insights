# Keycloak Configuration
#
# Environment variables:
#   KEYCLOAK_URL      - Keycloak server URL (default: http://localhost:8080)
#   KEYCLOAK_REALM    - Keycloak realm name (default: db90)
#   KEYCLOAK_AUDIENCE - Expected JWT audience (default: db90-web)
#   KEYCLOAK_ISSUER   - JWT issuer URL (auto-generated from URL + realm)
#   KEYCLOAK_JWKS_URI - JWKS endpoint URL (auto-generated from issuer)

# Explicitly require JwtAuth middleware before Rails autoloading
require_relative '../../app/middleware/jwt_auth'

module Keycloak
  class Configuration
    attr_accessor :url, :realm, :audience, :issuer, :jwks_uri

    def initialize
      @url = ENV.fetch('KEYCLOAK_URL', 'http://localhost:8080')
      @realm = ENV.fetch('KEYCLOAK_REALM', 'db90')
      @audience = ENV.fetch('KEYCLOAK_AUDIENCE', 'db90-web')
      @issuer = ENV.fetch('KEYCLOAK_ISSUER') { "#{@url}/realms/#{@realm}" }
      @jwks_uri = ENV.fetch('KEYCLOAK_JWKS_URI') { "#{@issuer}/protocol/openid-connect/certs" }
    end

    def openid_config_url
      "#{issuer}/.well-known/openid-configuration"
    end

    def token_url
      "#{issuer}/protocol/openid-connect/token"
    end

    def userinfo_url
      "#{issuer}/protocol/openid-connect/userinfo"
    end

    def logout_url
      "#{issuer}/protocol/openid-connect/logout"
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

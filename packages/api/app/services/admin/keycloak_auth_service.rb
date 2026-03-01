# frozen_string_literal: true

require 'net/http'
require 'digest'

module Admin
  class KeycloakAuthService
    Result = Struct.new(:success?, :user, :error, keyword_init: true)

    def authorize_url(redirect_uri, code_verifier)
      params = {
        client_id: config.audience,
        redirect_uri: redirect_uri,
        response_type: 'code',
        scope: 'openid profile email',
        code_challenge: pkce_challenge(code_verifier),
        code_challenge_method: 'S256'
      }
      "#{config.authorize_url}?#{params.to_query}"
    end

    def authenticate(code, code_verifier, redirect_uri)
      return failure('No authorization code received') unless code.present?
      return failure('Session expired. Please try again.') unless code_verifier.present?

      token_response = exchange_code(code, code_verifier, redirect_uri)
      return failure('Failed to obtain access token') unless token_response&.dig('access_token')

      claims = Keycloak::JwtVerifier.verify(token_response['access_token'])
      return failure('Invalid token') unless claims

      user = find_admin_user(claims)
      return failure('Access denied. Global admin role required.') unless user

      Result.new(success?: true, user: user)
    end

    private

    def config
      Keycloak.configuration
    end

    def failure(message)
      Result.new(success?: false, error: message)
    end

    def pkce_challenge(verifier)
      Base64.urlsafe_encode64(Digest::SHA256.digest(verifier), padding: false)
    end

    def exchange_code(code, verifier, redirect_uri)
      uri = URI(config.internal_token_url)
      response = Net::HTTP.post_form(uri, {
        grant_type: 'authorization_code',
        client_id: config.audience,
        code: code,
        redirect_uri: redirect_uri,
        code_verifier: verifier
      })

      unless response.is_a?(Net::HTTPSuccess)
        Rails.logger.error("[KeycloakAuthService] Token exchange failed: #{response.code} #{response.body}")
        return nil
      end

      JSON.parse(response.body)
    rescue StandardError => e
      Rails.logger.error("[KeycloakAuthService] Token exchange error: #{e.class} #{e.message}")
      nil
    end

    def find_admin_user(claims)
      user = User.find_by(keycloak_sub: claims['sub']) || User.find_by(email: claims['email'])
      user if user&.global_admin?
    end
  end
end

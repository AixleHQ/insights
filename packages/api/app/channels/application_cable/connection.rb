# frozen_string_literal: true

module ApplicationCable
  class Connection < ActionCable::Connection::Base
    identified_by :current_user

    def connect
      self.current_user = find_verified_user
    end

    private

    def find_verified_user
      token = extract_token

      unless token
        reject_unauthorized_connection
        return
      end

      claims = decode_jwt(token)

      unless claims
        reject_unauthorized_connection
        return
      end

      # Use sub if available, otherwise fall back to preferred_username or email
      user_identifier = claims['sub'] || claims['preferred_username'] || claims['email']

      unless user_identifier
        Rails.logger.warn "[ActionCable] No user identifier in token"
        reject_unauthorized_connection
        return
      end

      user = User.find_by(keycloak_sub: user_identifier)

      unless user
        Rails.logger.warn "[ActionCable] User not found for identifier: #{user_identifier}"
        reject_unauthorized_connection
        return
      end

      user
    end

    def extract_token
      # Try Authorization header first (passed via ActionCable)
      if request.headers['Authorization'].present?
        auth_header = request.headers['Authorization']
        return auth_header.split(' ').last if auth_header.start_with?('Bearer ')
      end

      # Try token query parameter (common for WebSocket connections)
      request.params[:token]
    end

    def decode_jwt(token)
      # Use the same JWT verification as the main app
      jwks_uri = ENV.fetch('KEYCLOAK_JWKS_URI') do
        keycloak_url = ENV.fetch('KEYCLOAK_URL', 'http://localhost:8080')
        realm = ENV.fetch('KEYCLOAK_REALM', 'db90')
        "#{keycloak_url}/realms/#{realm}/protocol/openid-connect/certs"
      end

      jwks_response = Net::HTTP.get(URI(jwks_uri))
      jwks = JSON.parse(jwks_response)
      jwk_keys = jwks['keys']

      # Get the first RS256 key
      key_data = jwk_keys.find { |k| k['alg'] == 'RS256' || k['use'] == 'sig' }
      return nil unless key_data

      jwk = JWT::JWK.new(key_data)

      options = {
        algorithm: 'RS256',
        verify_aud: false, # Audience verification is optional
        verify_iss: false  # Issuer verification handled by Keycloak middleware
      }

      decoded = JWT.decode(token, jwk.public_key, true, options)
      decoded.first
    rescue JWT::DecodeError, JWT::ExpiredSignature, StandardError => e
      Rails.logger.warn "[ActionCable] JWT decode failed: #{e.message}"
      nil
    end
  end
end

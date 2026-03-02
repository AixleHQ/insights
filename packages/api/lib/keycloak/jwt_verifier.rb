# frozen_string_literal: true

require "jwt"
require "net/http"

module Keycloak
  module JwtVerifier
    class VerificationError < StandardError; end

    module_function

    # Verify a Keycloak access token and return decoded claims.
    # Returns nil on failure (logs warning).
    def verify(token)
      header = JWT.decode(token, nil, false).last
      kid = header["kid"]

      public_key = resolve_key(kid)
      return nil unless public_key

      decoded = JWT.decode(token, public_key, true, {
        algorithm: "RS256",
        verify_expiration: true
      })

      decoded.first
    rescue JWT::DecodeError, StandardError => e
      Rails.logger.warn("[Keycloak::JwtVerifier] Verification failed: #{e.message}")
      nil
    end

    # Same as verify but raises VerificationError on failure.
    def verify!(token)
      verify(token) || raise(VerificationError, "Token verification failed")
    end

    def fetch_jwks
      Rails.cache.fetch("keycloak_jwks", expires_in: 1.hour) do
        uri = URI(Keycloak.configuration.jwks_uri)
        response = Net::HTTP.get_response(uri)

        unless response.is_a?(Net::HTTPSuccess)
          raise VerificationError, "Failed to fetch JWKS: #{response.code}"
        end

        JSON.parse(response.body)
      end
    rescue Errno::ECONNREFUSED, SocketError => e
      Rails.logger.error("[Keycloak::JwtVerifier] Cannot connect to Keycloak: #{e.message}")
      raise VerificationError, "Cannot connect to identity provider"
    end

    def resolve_key(kid)
      jwks = fetch_jwks
      key_data = jwks["keys"]&.find { |k| k["kid"] == kid }

      unless key_data
        Rails.logger.warn("[Keycloak::JwtVerifier] Key not found: #{kid}")
        return nil
      end

      build_rsa_key(key_data)
    end

    def build_rsa_key(key_data)
      n = Base64.urlsafe_decode64(key_data["n"])
      e = Base64.urlsafe_decode64(key_data["e"])

      data_sequence = OpenSSL::ASN1::Sequence([
        OpenSSL::ASN1::Integer(OpenSSL::BN.new(n, 2)),
        OpenSSL::ASN1::Integer(OpenSSL::BN.new(e, 2))
      ])

      OpenSSL::PKey::RSA.new(data_sequence.to_der)
    end
  end
end

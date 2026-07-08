# frozen_string_literal: true

require "jwt"
require "net/http"

module Keycloak
  module JwtVerifier
    class VerificationError < StandardError; end

    # Raised when Keycloak cannot be reached at all (connection refused, DNS/socket
    # failure, or timeout) — as opposed to a token that is present but invalid. Subclasses
    # VerificationError so existing rescues keep working; callers that care about the
    # distinction (retry vs. re-auth) can rescue it specifically.
    class UnavailableError < VerificationError; end

    # Connectivity failures worth a bounded retry (transient network / Keycloak blip),
    # distinct from an HTTP response that came back but was unsuccessful.
    CONNECT_ERRORS = [
      Errno::ECONNREFUSED, Errno::ETIMEDOUT, Errno::EHOSTUNREACH, Errno::ENETUNREACH,
      SocketError, Net::OpenTimeout, Net::ReadTimeout, Timeout::Error
    ].freeze

    OPEN_TIMEOUT_SECONDS = 5
    READ_TIMEOUT_SECONDS = 5
    MAX_ATTEMPTS = 2
    RETRY_BACKOFF_SECONDS = 0.2

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
        verify_expiration: true,
        verify_not_before: true,
        verify_iss: true,
        iss: Keycloak.configuration.issuer,
        verify_aud: true,
        aud: Keycloak.configuration.audience
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
        response = http_get(URI(Keycloak.configuration.jwks_uri))

        unless response.is_a?(Net::HTTPSuccess)
          raise VerificationError, "Failed to fetch JWKS: #{response.code}"
        end

        JSON.parse(response.body)
      end
    end

    # GET with explicit timeouts and one bounded retry. A connectivity failure that
    # survives the retry is reported to Rollbar and re-raised as UnavailableError so it is
    # distinguishable from a token that is merely invalid. The default Net::HTTP timeout is
    # 60s — without an explicit one, an unreachable Keycloak would hang a request thread.
    def http_get(uri)
      attempt = 0
      begin
        attempt += 1
        Net::HTTP.start(uri.host, uri.port,
          use_ssl: uri.scheme == "https",
          open_timeout: OPEN_TIMEOUT_SECONDS,
          read_timeout: READ_TIMEOUT_SECONDS) do |http|
          http.get(uri.request_uri)
        end
      rescue *CONNECT_ERRORS => e
        if attempt < MAX_ATTEMPTS
          Rails.logger.warn(
            "[Keycloak::JwtVerifier] JWKS fetch attempt #{attempt} failed (#{e.class}: #{e.message}); retrying"
          )
          sleep(RETRY_BACKOFF_SECONDS)
          retry
        end
        Rails.logger.error(
          "[Keycloak::JwtVerifier] Cannot connect to Keycloak after #{attempt} attempts: #{e.class}: #{e.message}"
        )
        Rollbar.error(e, context: "keycloak_jwks_fetch", attempts: attempt)
        raise UnavailableError, "Cannot connect to identity provider"
      end
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

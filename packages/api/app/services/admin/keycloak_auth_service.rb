# frozen_string_literal: true

require "net/http"
require "digest"

module Admin
  class KeycloakAuthService
    Result = Struct.new(:success?, :user, :error, keyword_init: true)

    # Raised when the Keycloak token endpoint can't be reached (vs. a code that was
    # rejected). Lets #authenticate tell the user "try again" instead of "session expired".
    class UnavailableError < StandardError; end

    def authorize_url(redirect_uri, code_verifier)
      params = {
        client_id: config.audience,
        redirect_uri: redirect_uri,
        response_type: "code",
        scope: "openid profile email",
        code_challenge: pkce_challenge(code_verifier),
        code_challenge_method: "S256"
      }
      "#{config.authorize_url}?#{params.to_query}"
    end

    def authenticate(code, code_verifier, redirect_uri)
      return failure("No authorization code received") unless code.present?
      return failure("Session expired. Please try again.") unless code_verifier.present?

      token_response = exchange_code(code, code_verifier, redirect_uri)
      return failure("Failed to obtain access token") unless token_response&.dig("access_token")

      claims = Keycloak::JwtVerifier.verify(token_response["access_token"])
      return failure("Invalid token") unless claims

      user = find_admin_user(claims)
      return failure("Access denied. Global admin role required.") unless user

      Result.new(success?: true, user: user)
    rescue UnavailableError
      failure("Identity provider is temporarily unavailable. Please try again.")
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
      response = post_form(uri, {
        grant_type: "authorization_code",
        client_id: config.audience,
        code: code,
        redirect_uri: redirect_uri,
        code_verifier: verifier
      })

      unless response.is_a?(Net::HTTPSuccess)
        # A response came back but the code was rejected (expired/replayed/PKCE mismatch).
        # Distinct from a connectivity failure — return nil so the caller reports a code error.
        Rails.logger.error("[KeycloakAuthService] Token exchange rejected: #{response.code} #{response.body}")
        return nil
      end

      JSON.parse(response.body)
    rescue *Keycloak::JwtVerifier::CONNECT_ERRORS => e
      Rails.logger.error("[KeycloakAuthService] Token exchange connectivity failure: #{e.class} #{e.message}")
      Rollbar.error(e, context: "keycloak_admin_token_exchange")
      raise UnavailableError
    end

    # POST with explicit timeouts and one bounded retry, reusing JwtVerifier's timeout /
    # retry / connectivity-error policy. Net::HTTP.post_form has no timeout control, so an
    # unreachable Keycloak would otherwise hang the admin-login request thread.
    def post_form(uri, params)
      attempt = 0
      begin
        attempt += 1
        Net::HTTP.start(uri.host, uri.port,
          use_ssl: uri.scheme == "https",
          open_timeout: Keycloak::JwtVerifier::OPEN_TIMEOUT_SECONDS,
          read_timeout: Keycloak::JwtVerifier::READ_TIMEOUT_SECONDS) do |http|
          request = Net::HTTP::Post.new(uri.request_uri)
          request.set_form_data(params)
          http.request(request)
        end
      rescue *Keycloak::JwtVerifier::CONNECT_ERRORS
        if attempt < Keycloak::JwtVerifier::MAX_ATTEMPTS
          sleep(Keycloak::JwtVerifier::RETRY_BACKOFF_SECONDS)
          retry
        end
        raise
      end
    end

    def find_admin_user(claims)
      user = User.find_by(keycloak_sub: claims["sub"]) || User.find_by(email: claims["email"])
      user if user&.global_admin?
    end
  end
end

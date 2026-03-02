# frozen_string_literal: true

class ImpersonationService
  ALGORITHM = "HS256"
  TOKEN_EXPIRY = 1.hour

  class << self
    def generate_token(admin_user:, target_user:)
      payload = {
        sub: target_user.keycloak_sub,
        email: target_user.email,
        name: target_user.name,
        picture: target_user.avatar_url,
        impersonator_id: admin_user.id,
        impersonator_email: admin_user.email,
        iat: Time.current.to_i,
        exp: TOKEN_EXPIRY.from_now.to_i,
        iss: "db90-impersonation"
      }

      JWT.encode(payload, secret_key, ALGORITHM)
    end

    def decode_token(token)
      decoded = JWT.decode(token, secret_key, true, { algorithm: ALGORITHM })
      payload = decoded.first

      # Verify it's an impersonation token
      raise JWT::InvalidIssuerError, "Not an impersonation token" unless payload["iss"] == "db90-impersonation"

      payload
    rescue JWT::ExpiredSignature
      nil
    rescue JWT::DecodeError => e
      Rails.logger.warn "[ImpersonationService] Token decode failed: #{e.message}"
      nil
    end

    def valid_token?(token)
      decode_token(token).present?
    end

    private

    def secret_key
      Rails.application.credentials.secret_key_base ||
        ENV.fetch("SECRET_KEY_BASE", "development_secret_key_for_impersonation")
    end
  end
end

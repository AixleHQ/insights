# frozen_string_literal: true

class ImpersonationService
  ALGORITHM = "HS256"
  TOKEN_EXPIRY = 1.hour
  REDIS_KEY_PREFIX = "impersonation:jti:"

  class << self
    def generate_token(admin_user:, target_user:)
      exp = TOKEN_EXPIRY.from_now.to_i
      payload = {
        sub: target_user.keycloak_sub,
        email: target_user.email,
        name: target_user.name,
        picture: target_user.avatar_url,
        impersonator_id: admin_user.id,
        impersonator_email: admin_user.email,
        iat: Time.current.to_i,
        exp: exp,
        jti: SecureRandom.uuid,
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

    # Adds the token's jti to the Redis blocklist. ttl_seconds is computed from
    # the token's remaining lifetime so the key auto-expires when the token would
    # have expired anyway.
    def revoke_token(jti, exp)
      ttl = exp.to_i - Time.current.to_i
      return if ttl <= 0

      REDIS.setex(redis_key(jti), ttl, "revoked")
    rescue Redis::BaseError => e
      Rails.logger.error("[ImpersonationService] Redis error in revoke_token: #{e.message}")
    end

    def revoked?(jti)
      return false if jti.blank?

      REDIS.exists?(redis_key(jti))
    rescue Redis::BaseError => e
      Rails.logger.error("[ImpersonationService] Redis error in revoked?: #{e.message}")
      false
    end

    private

    def redis_key(jti)
      "#{REDIS_KEY_PREFIX}#{jti}"
    end

    def secret_key
      Rails.application.credentials.secret_key_base ||
        ENV.fetch("SECRET_KEY_BASE", "development_secret_key_for_impersonation")
    end
  end
end

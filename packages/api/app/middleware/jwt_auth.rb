require "jwt"
require "net/http"
require "json"
require_relative "../../lib/keycloak/jwt_verifier"

class JwtAuth
  class AuthError < StandardError; end
  class TokenExpiredError < AuthError; end
  class InvalidTokenError < AuthError; end

  EXCLUDED_PATHS = [
    "/health",
    "/api/v1/health",
    "/up",
    "/admin",
    "/api/internal",
    "/api/v1/ingest",
    "/api/v1/projects/lookup"
  ].freeze

  EXCLUDED_PATTERNS = [
    /\A\/api\/v1\/invitations\/(?!check\z)[^\/]+\z/,
    /\A\/api\/v1\/webhooks\/openrouter_traces\/[^\/]+\z/
  ].freeze

  def initialize(app)
    @app = app
  end

  def call(env)
    request = Rack::Request.new(env)

    if excluded_path?(request.path)
      return @app.call(env)
    end

    if env["jwt.claims"]
      return @app.call(env)
    end

    token = extract_token(request)

    if token.nil?
      return unauthorized_response("Missing authorization token")
    end

    begin
      impersonation_claims = ImpersonationService.decode_token(token) rescue nil
      if impersonation_claims
        env["jwt.claims"] = impersonation_claims
        env["jwt.token"] = token
        env["jwt.impersonation"] = true
        env["jwt.impersonator_id"] = impersonation_claims["impersonator_id"]
        env["jwt.impersonator_email"] = impersonation_claims["impersonator_email"]
        Rails.logger.info("[JwtAuth] Impersonation token validated for #{impersonation_claims['email']}")
        return @app.call(env)
      end

      Rails.logger.debug("[JwtAuth] Validating Keycloak token...")
      begin
        unverified = JWT.decode(token, nil, false).first
        Rails.logger.debug("[JwtAuth] Token claims: #{unverified.keys.join(', ')}")
      rescue => e
        Rails.logger.debug("[JwtAuth] Could not decode token for debugging: #{e.message}")
      end

      claims = validate_token(token)
      Rails.logger.info("[JwtAuth] Token validated for #{claims['email']}")
      env["jwt.claims"] = claims
      env["jwt.token"] = token
      @app.call(env)
    rescue TokenExpiredError
      Rails.logger.warn("[JwtAuth] Token expired")
      unauthorized_response("Token has expired")
    rescue InvalidTokenError => e
      Rails.logger.warn("[JwtAuth] Invalid token: #{e.message}")
      unauthorized_response("Invalid token: #{e.message}")
    rescue JWT::DecodeError => e
      Rails.logger.warn("[JwtAuth] Token decode error: #{e.message}")
      unauthorized_response("Token decode error: #{e.message}")
    rescue => e
      Rails.logger.error("[JwtAuth] Unexpected error: #{e.class} - #{e.message}")
      Rails.logger.error(e.backtrace.first(5).join("\n"))
      unauthorized_response("Authentication failed")
    end
  end

  private

  def excluded_path?(path)
    return true if EXCLUDED_PATHS.any? { |excluded| path == excluded || path.start_with?("#{excluded}/") }
    return true if EXCLUDED_PATTERNS.any? { |pattern| path.match?(pattern) }
    false
  end

  def extract_token(request)
    auth_header = request.env["HTTP_AUTHORIZATION"]
    return nil unless auth_header

    scheme, token = auth_header.split(" ", 2)
    return nil unless scheme&.downcase == "bearer" && token.present?

    token
  end

  def validate_token(token)
    header = JWT.decode(token, nil, false).last
    kid = header["kid"]

    public_key = Keycloak::JwtVerifier.resolve_key(kid)
    raise InvalidTokenError, "Key not found: #{kid}" unless public_key

    options = {
      algorithm: "RS256",
      verify_iss: true,
      iss: Keycloak.configuration.issuer,
      verify_aud: true,
      aud: Keycloak.configuration.audience,
      verify_expiration: true
    }

    decoded = JWT.decode(token, public_key, true, options)
    claims = decoded.first

    validate_claims!(claims)
    claims
  rescue JWT::ExpiredSignature
    raise TokenExpiredError, "Token has expired"
  rescue JWT::InvalidIssuerError
    raise InvalidTokenError, "Invalid issuer"
  rescue JWT::InvalidAudError
    raise InvalidTokenError, "Invalid audience"
  rescue Keycloak::JwtVerifier::VerificationError => e
    raise InvalidTokenError, e.message
  rescue JWT::DecodeError => e
    raise InvalidTokenError, e.message
  end

  def validate_claims!(claims)
    unless claims["email"].present?
      raise InvalidTokenError, "Missing required claim: email"
    end

    unless claims["sub"].present?
      claims["sub"] = claims["preferred_username"] || claims["email"]
      Rails.logger.debug("[JwtAuth] Using fallback sub: #{claims['sub']}")
    end

    if claims["nbf"] && Time.now.to_i < claims["nbf"]
      raise InvalidTokenError, "Token not yet valid"
    end
  end

  def unauthorized_response(message)
    body = { error: "Unauthorized", message: message }.to_json
    [
      401,
      { "Content-Type" => "application/json", "WWW-Authenticate" => "Bearer" },
      [ body ]
    ]
  end
end

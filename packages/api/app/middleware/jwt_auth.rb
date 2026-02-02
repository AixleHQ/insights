require 'jwt'
require 'net/http'
require 'json'

class JwtAuth
  class AuthError < StandardError; end
  class TokenExpiredError < AuthError; end
  class InvalidTokenError < AuthError; end

  EXCLUDED_PATHS = [
    '/health',
    '/api/v1/health',
    '/up',
    '/admin',
    '/api/internal'
  ].freeze

  # Patterns for public endpoints that don't require authentication
  # GET /api/v1/invitations/:token (viewing invitation)
  # Uses negative lookahead to exclude "check" route which requires auth
  EXCLUDED_PATTERNS = [
    /\A\/api\/v1\/invitations\/(?!check\z)[^\/]+\z/  # Matches /api/v1/invitations/{token} but NOT /api/v1/invitations/check
  ].freeze

  def initialize(app)
    @app = app
  end

  def call(env)
    request = Rack::Request.new(env)

    # Skip auth for excluded paths
    if excluded_path?(request.path)
      return @app.call(env)
    end

    # Skip if claims already set (e.g., by test middleware)
    if env['jwt.claims']
      return @app.call(env)
    end

    # Extract and validate token
    token = extract_token(request)

    if token.nil?
      return unauthorized_response('Missing authorization token')
    end

    begin
      # First, check if it's an impersonation token (silently - don't log failures)
      impersonation_claims = ImpersonationService.decode_token(token) rescue nil
      if impersonation_claims
        env['jwt.claims'] = impersonation_claims
        env['jwt.token'] = token
        env['jwt.impersonation'] = true
        env['jwt.impersonator_id'] = impersonation_claims['impersonator_id']
        env['jwt.impersonator_email'] = impersonation_claims['impersonator_email']
        Rails.logger.info("[JwtAuth] Impersonation token validated for #{impersonation_claims['email']}")
        return @app.call(env)
      end

      # Otherwise, validate as Keycloak token
      Rails.logger.debug("[JwtAuth] Validating Keycloak token...")
      # Debug: log token claims before validation
      begin
        unverified = JWT.decode(token, nil, false).first
        Rails.logger.debug("[JwtAuth] Token claims: #{unverified.keys.join(', ')}")
      rescue => e
        Rails.logger.debug("[JwtAuth] Could not decode token for debugging: #{e.message}")
      end
      claims = validate_token(token)
      Rails.logger.info("[JwtAuth] Token validated for #{claims['email']}")
      env['jwt.claims'] = claims
      env['jwt.token'] = token
      @app.call(env)
    rescue TokenExpiredError
      Rails.logger.warn("[JwtAuth] Token expired")
      unauthorized_response('Token has expired')
    rescue InvalidTokenError => e
      Rails.logger.warn("[JwtAuth] Invalid token: #{e.message}")
      unauthorized_response("Invalid token: #{e.message}")
    rescue JWT::DecodeError => e
      Rails.logger.warn("[JwtAuth] Token decode error: #{e.message}")
      unauthorized_response("Token decode error: #{e.message}")
    rescue => e
      Rails.logger.error("[JwtAuth] Unexpected error: #{e.class} - #{e.message}")
      Rails.logger.error(e.backtrace.first(5).join("\n"))
      unauthorized_response('Authentication failed')
    end
  end

  private

  def excluded_path?(path)
    return true if EXCLUDED_PATHS.any? { |excluded| path == excluded || path.start_with?("#{excluded}/") }
    return true if EXCLUDED_PATTERNS.any? { |pattern| path.match?(pattern) }
    false
  end

  def extract_token(request)
    auth_header = request.env['HTTP_AUTHORIZATION']
    return nil unless auth_header

    scheme, token = auth_header.split(' ', 2)
    return nil unless scheme&.downcase == 'bearer' && token.present?

    token
  end

  def validate_token(token)
    # Decode header to get key ID
    header = JWT.decode(token, nil, false).last
    kid = header['kid']

    # Get the public key from JWKS
    public_key = jwks_loader.call({ kid: kid })

    # Decode and verify the token
    options = {
      algorithm: 'RS256',
      verify_iss: true,
      iss: keycloak_issuer,
      verify_aud: true,
      aud: keycloak_audience,
      verify_expiration: true
    }

    decoded = JWT.decode(token, public_key, true, options)
    claims = decoded.first

    # Additional validation
    validate_claims!(claims)

    claims
  rescue JWT::ExpiredSignature
    raise TokenExpiredError, 'Token has expired'
  rescue JWT::InvalidIssuerError
    raise InvalidTokenError, 'Invalid issuer'
  rescue JWT::InvalidAudError
    raise InvalidTokenError, 'Invalid audience'
  rescue JWT::DecodeError => e
    raise InvalidTokenError, e.message
  end

  def validate_claims!(claims)
    # Ensure we have an email
    unless claims['email'].present?
      raise InvalidTokenError, "Missing required claim: email"
    end

    # If 'sub' is missing, use a fallback identifier
    # Keycloak access tokens may not include 'sub' by default
    unless claims['sub'].present?
      # Use azp (authorized party / client ID) + email as a stable identifier
      # Or just use email since it's unique in Keycloak
      claims['sub'] = claims['preferred_username'] || claims['email']
      Rails.logger.debug("[JwtAuth] Using fallback sub: #{claims['sub']}")
    end

    # Validate token is not used before its valid time
    if claims['nbf'] && Time.now.to_i < claims['nbf']
      raise InvalidTokenError, 'Token not yet valid'
    end
  end

  def jwks_loader
    @jwks_loader ||= lambda do |options|
      kid = options[:kid]
      jwks = fetch_jwks

      key_data = jwks['keys'].find { |k| k['kid'] == kid }
      raise InvalidTokenError, "Key not found: #{kid}" unless key_data

      build_public_key(key_data)
    end
  end

  def fetch_jwks
    Rails.cache.fetch('keycloak_jwks', expires_in: 1.hour) do
      uri = URI(jwks_uri)
      response = Net::HTTP.get_response(uri)

      unless response.is_a?(Net::HTTPSuccess)
        raise InvalidTokenError, "Failed to fetch JWKS: #{response.code}"
      end

      JSON.parse(response.body)
    end
  rescue Errno::ECONNREFUSED, SocketError => e
    Rails.logger.error("[JwtAuth] Cannot connect to Keycloak: #{e.message}")
    raise InvalidTokenError, 'Cannot connect to identity provider'
  end

  def build_public_key(key_data)
    case key_data['kty']
    when 'RSA'
      build_rsa_key(key_data)
    else
      raise InvalidTokenError, "Unsupported key type: #{key_data['kty']}"
    end
  end

  def build_rsa_key(key_data)
    n = Base64.urlsafe_decode64(key_data['n'])
    e = Base64.urlsafe_decode64(key_data['e'])

    # Build RSA public key using ASN1 sequence (OpenSSL 3.0 compatible)
    data_sequence = OpenSSL::ASN1::Sequence([
      OpenSSL::ASN1::Integer(OpenSSL::BN.new(n, 2)),
      OpenSSL::ASN1::Integer(OpenSSL::BN.new(e, 2))
    ])

    OpenSSL::PKey::RSA.new(data_sequence.to_der)
  end

  def keycloak_issuer
    @keycloak_issuer ||= ENV.fetch('KEYCLOAK_ISSUER') do
      realm = ENV.fetch('KEYCLOAK_REALM', 'db90')
      base_url = ENV.fetch('KEYCLOAK_URL', 'http://localhost:8080')
      "#{base_url}/realms/#{realm}"
    end
  end

  def keycloak_audience
    @keycloak_audience ||= ENV.fetch('KEYCLOAK_AUDIENCE', 'db90-web')
  end

  def jwks_uri
    @jwks_uri ||= ENV.fetch('KEYCLOAK_JWKS_URI') do
      "#{keycloak_issuer}/protocol/openid-connect/certs"
    end
  end

  def unauthorized_response(message)
    body = { error: 'Unauthorized', message: message }.to_json
    [
      401,
      { 'Content-Type' => 'application/json', 'WWW-Authenticate' => 'Bearer' },
      [body]
    ]
  end
end

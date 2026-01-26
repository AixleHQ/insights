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
    '/up'
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

    # Extract and validate token
    token = extract_token(request)

    if token.nil?
      return unauthorized_response('Missing authorization token')
    end

    begin
      claims = validate_token(token)
      env['jwt.claims'] = claims
      env['jwt.token'] = token
      @app.call(env)
    rescue TokenExpiredError
      unauthorized_response('Token has expired')
    rescue InvalidTokenError => e
      unauthorized_response("Invalid token: #{e.message}")
    rescue JWT::DecodeError => e
      unauthorized_response("Token decode error: #{e.message}")
    rescue => e
      Rails.logger.error("[JwtAuth] Unexpected error: #{e.class} - #{e.message}")
      unauthorized_response('Authentication failed')
    end
  end

  private

  def excluded_path?(path)
    EXCLUDED_PATHS.any? { |excluded| path == excluded || path.start_with?("#{excluded}/") }
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
    # Ensure required claims are present
    required_claims = %w[sub email]
    missing = required_claims - claims.keys
    raise InvalidTokenError, "Missing required claims: #{missing.join(', ')}" if missing.any?

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

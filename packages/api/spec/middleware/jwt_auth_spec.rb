require 'rails_helper'

RSpec.describe JwtAuth do
  let(:app) { ->(env) { [200, { 'Content-Type' => 'application/json' }, ['OK']] } }
  let(:middleware) { described_class.new(app) }

  describe '#call' do
    context 'with excluded paths' do
      it 'skips auth for /health' do
        env = Rack::MockRequest.env_for('/health')
        status, _headers, _body = middleware.call(env)

        expect(status).to eq(200)
      end

      it 'skips auth for /api/v1/health' do
        env = Rack::MockRequest.env_for('/api/v1/health')
        status, _headers, _body = middleware.call(env)

        expect(status).to eq(200)
      end

      it 'skips auth for /up' do
        env = Rack::MockRequest.env_for('/up')
        status, _headers, _body = middleware.call(env)

        expect(status).to eq(200)
      end
    end

    context 'without authorization header' do
      it 'returns 401 Unauthorized' do
        env = Rack::MockRequest.env_for('/api/v1/users')
        status, headers, body = middleware.call(env)

        expect(status).to eq(401)
        expect(headers['Content-Type']).to eq('application/json')
        expect(headers['WWW-Authenticate']).to eq('Bearer')

        response = JSON.parse(body.first)
        expect(response['error']).to eq('Unauthorized')
        expect(response['message']).to eq('Missing authorization token')
      end
    end

    context 'with invalid authorization header format' do
      it 'returns 401 for missing Bearer prefix' do
        env = Rack::MockRequest.env_for('/api/v1/users',
          'HTTP_AUTHORIZATION' => 'InvalidToken123'
        )
        status, _headers, body = middleware.call(env)

        expect(status).to eq(401)
        response = JSON.parse(body.first)
        expect(response['message']).to eq('Missing authorization token')
      end

      it 'returns 401 for empty token' do
        env = Rack::MockRequest.env_for('/api/v1/users',
          'HTTP_AUTHORIZATION' => 'Bearer '
        )
        status, _headers, body = middleware.call(env)

        expect(status).to eq(401)
        response = JSON.parse(body.first)
        expect(response['message']).to eq('Missing authorization token')
      end
    end

    context 'with invalid JWT' do
      it 'returns 401 for malformed token' do
        env = Rack::MockRequest.env_for('/api/v1/users',
          'HTTP_AUTHORIZATION' => 'Bearer not.a.valid.jwt'
        )
        status, _headers, body = middleware.call(env)

        expect(status).to eq(401)
        response = JSON.parse(body.first)
        expect(response['error']).to eq('Unauthorized')
      end
    end

    context 'with valid JWT' do
      let(:private_key) { OpenSSL::PKey::RSA.generate(2048) }
      let(:public_key) { private_key.public_key }
      let(:kid) { 'test-key-id' }

      let(:claims) do
        {
          'sub' => 'user-123',
          'email' => 'test@example.com',
          'name' => 'Test User',
          'iss' => 'http://localhost:8080/realms/db90',
          'aud' => 'db90-web',
          'exp' => 1.hour.from_now.to_i,
          'iat' => Time.now.to_i
        }
      end

      let(:token) do
        JWT.encode(claims, private_key, 'RS256', { kid: kid })
      end

      let(:jwks_response) do
        {
          'keys' => [
            {
              'kid' => kid,
              'kty' => 'RSA',
              'n' => Base64.urlsafe_encode64(public_key.n.to_s(2)),
              'e' => Base64.urlsafe_encode64(public_key.e.to_s(2))
            }
          ]
        }
      end

      before do
        # Stub the cache to return our JWKS - use any_args to match any call
        allow(Rails.cache).to receive(:fetch) do |key, **options, &block|
          if key == 'keycloak_jwks'
            jwks_response
          else
            block&.call
          end
        end
      end

      around do |example|
        # Set environment variables for this test
        original_issuer = ENV['KEYCLOAK_ISSUER']
        original_audience = ENV['KEYCLOAK_AUDIENCE']
        ENV['KEYCLOAK_ISSUER'] = 'http://localhost:8080/realms/db90'
        ENV['KEYCLOAK_AUDIENCE'] = 'db90-web'

        example.run

        ENV['KEYCLOAK_ISSUER'] = original_issuer
        ENV['KEYCLOAK_AUDIENCE'] = original_audience
      end

      it 'allows request through and sets claims in env' do
        # Create a fresh middleware instance after ENV is set
        fresh_middleware = described_class.new(app)
        env = Rack::MockRequest.env_for('/api/v1/users',
          'HTTP_AUTHORIZATION' => "Bearer #{token}"
        )

        status, _headers, _body = fresh_middleware.call(env)

        expect(status).to eq(200)
        expect(env['jwt.claims']).to include('sub' => 'user-123')
        expect(env['jwt.token']).to eq(token)
      end
    end

    context 'with expired JWT' do
      let(:private_key) { OpenSSL::PKey::RSA.generate(2048) }
      let(:public_key) { private_key.public_key }
      let(:kid) { 'test-key-id' }

      let(:expired_claims) do
        {
          'sub' => 'user-123',
          'email' => 'test@example.com',
          'iss' => 'http://localhost:8080/realms/db90',
          'aud' => 'db90-web',
          'exp' => 1.hour.ago.to_i,
          'iat' => 2.hours.ago.to_i
        }
      end

      let(:expired_token) do
        JWT.encode(expired_claims, private_key, 'RS256', { kid: kid })
      end

      let(:jwks_response) do
        {
          'keys' => [
            {
              'kid' => kid,
              'kty' => 'RSA',
              'n' => Base64.urlsafe_encode64(public_key.n.to_s(2)),
              'e' => Base64.urlsafe_encode64(public_key.e.to_s(2))
            }
          ]
        }
      end

      before do
        allow(Rails.cache).to receive(:fetch) do |key, **options, &block|
          if key == 'keycloak_jwks'
            jwks_response
          else
            block&.call
          end
        end
      end

      around do |example|
        original_issuer = ENV['KEYCLOAK_ISSUER']
        original_audience = ENV['KEYCLOAK_AUDIENCE']
        ENV['KEYCLOAK_ISSUER'] = 'http://localhost:8080/realms/db90'
        ENV['KEYCLOAK_AUDIENCE'] = 'db90-web'

        example.run

        ENV['KEYCLOAK_ISSUER'] = original_issuer
        ENV['KEYCLOAK_AUDIENCE'] = original_audience
      end

      it 'returns 401 with token expired message' do
        fresh_middleware = described_class.new(app)
        env = Rack::MockRequest.env_for('/api/v1/users',
          'HTTP_AUTHORIZATION' => "Bearer #{expired_token}"
        )

        status, _headers, body = fresh_middleware.call(env)

        expect(status).to eq(401)
        response = JSON.parse(body.first)
        expect(response['message']).to eq('Token has expired')
      end
    end
  end
end

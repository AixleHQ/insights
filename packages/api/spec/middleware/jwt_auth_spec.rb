require 'rails_helper'

RSpec.describe JwtAuth do
  let(:app) { ->(env) { [ 200, { 'Content-Type' => 'application/json' }, [ 'OK' ] ] } }
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

      it 'skips auth for active storage routes' do
        env = Rack::MockRequest.env_for('/rails/active_storage/blobs/test')
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

    context 'when the downstream app raises an unexpected error (AIX-465)' do
      let(:private_key) { OpenSSL::PKey::RSA.generate(2048) }
      let(:public_key) { private_key.public_key }
      let(:kid) { 'test-key-id' }

      let(:claims) do
        {
          'sub' => 'user-123',
          'email' => 'test@example.com',
          'iss' => 'http://localhost:8080/realms/db90',
          'aud' => 'db90-web',
          'exp' => 1.hour.from_now.to_i,
          'iat' => Time.now.to_i
        }
      end

      let(:token) { JWT.encode(claims, private_key, 'RS256', { kid: kid }) }

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

      let(:failing_app) do
        ->(_env) { raise ActiveRecord::RecordNotDestroyed, 'Failed to destroy Repository with id=123' }
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

      it 'propagates the error instead of masking it as a 401' do
        fresh_middleware = described_class.new(failing_app)
        env = Rack::MockRequest.env_for('/api/v1/organizations/1/connectors/1',
          'HTTP_AUTHORIZATION' => "Bearer #{token}"
        )

        expect { fresh_middleware.call(env) }.to raise_error(ActiveRecord::RecordNotDestroyed)
      end
    end

    context 'with a valid impersonation token' do
      let(:admin) { create(:user, :global_admin) }
      let(:target) { create(:user) }
      let(:token) { ImpersonationService.generate_token(admin_user: admin, target_user: target) }

      after do
        jti = JWT.decode(token, nil, false).first['jti']
        REDIS.del("impersonation:jti:#{jti}") if jti
      end

      it 'allows the request through' do
        env = Rack::MockRequest.env_for('/api/v1/users',
          'HTTP_AUTHORIZATION' => "Bearer #{token}"
        )

        status, _headers, _body = middleware.call(env)

        expect(status).to eq(200)
      end

      it 'sets jwt.impersonation to true' do
        env = Rack::MockRequest.env_for('/api/v1/users',
          'HTTP_AUTHORIZATION' => "Bearer #{token}"
        )
        middleware.call(env)

        expect(env['jwt.impersonation']).to be true
      end

      it 'sets jwt.claims with the target user email' do
        env = Rack::MockRequest.env_for('/api/v1/users',
          'HTTP_AUTHORIZATION' => "Bearer #{token}"
        )
        middleware.call(env)

        expect(env['jwt.claims']['email']).to eq(target.email)
      end

      it 'sets jwt.impersonator_id' do
        env = Rack::MockRequest.env_for('/api/v1/users',
          'HTTP_AUTHORIZATION' => "Bearer #{token}"
        )
        middleware.call(env)

        expect(env['jwt.impersonator_id']).to eq(admin.id)
      end
    end

    context 'with a revoked impersonation token' do
      let(:admin) { create(:user, :global_admin) }
      let(:target) { create(:user) }
      let(:token) { ImpersonationService.generate_token(admin_user: admin, target_user: target) }
      let(:jti) { JWT.decode(token, nil, false).first['jti'] }
      let(:exp) { JWT.decode(token, nil, false).first['exp'] }

      before { ImpersonationService.revoke_token(jti, exp) }
      after  { REDIS.del("impersonation:jti:#{jti}") }

      it 'returns 401' do
        env = Rack::MockRequest.env_for('/api/v1/users',
          'HTTP_AUTHORIZATION' => "Bearer #{token}"
        )

        status, _headers, body = middleware.call(env)

        expect(status).to eq(401)
        response = JSON.parse(body.first)
        expect(response['message']).to eq('Impersonation token has been revoked')
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

    context 'when Keycloak is unreachable during verification' do
      let(:private_key) { OpenSSL::PKey::RSA.generate(2048) }
      let(:kid) { 'test-key-id' }
      let(:claims) do
        {
          'sub' => 'user-123',
          'email' => 'test@example.com',
          'iss' => 'http://localhost:8080/realms/db90',
          'aud' => 'db90-web',
          'exp' => 1.hour.from_now.to_i,
          'iat' => Time.now.to_i
        }
      end
      let(:token) { JWT.encode(claims, private_key, 'RS256', { kid: kid }) }

      around do |example|
        original_issuer = ENV['KEYCLOAK_ISSUER']
        original_audience = ENV['KEYCLOAK_AUDIENCE']
        ENV['KEYCLOAK_ISSUER'] = 'http://localhost:8080/realms/db90'
        ENV['KEYCLOAK_AUDIENCE'] = 'db90-web'

        example.run

        ENV['KEYCLOAK_ISSUER'] = original_issuer
        ENV['KEYCLOAK_AUDIENCE'] = original_audience
      end

      before do
        # Simulate JWKS fetch failing because Keycloak can't be reached.
        allow(Keycloak::JwtVerifier).to receive(:resolve_key)
          .and_raise(Keycloak::JwtVerifier::UnavailableError, 'Cannot connect to identity provider')
      end

      # 503-vs-401 is deferred (AIX-529 defers the API contract change); an
      # identity-provider connectivity failure still surfaces as 401 for now.
      it 'returns 401 Unauthorized' do
        fresh_middleware = described_class.new(app)
        env = Rack::MockRequest.env_for('/api/v1/users',
          'HTTP_AUTHORIZATION' => "Bearer #{token}"
        )

        status, _headers, body = fresh_middleware.call(env)

        expect(status).to eq(401)
        response = JSON.parse(body.first)
        expect(response['message']).to match(/identity provider/i)
      end
    end
  end
end

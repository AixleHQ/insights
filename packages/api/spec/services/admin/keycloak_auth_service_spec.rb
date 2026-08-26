# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Admin::KeycloakAuthService do
  let(:service) { described_class.new }

  describe '#authorize_url' do
    it 'includes the given state param' do
      url = service.authorize_url('https://app.example.com/admin/callback', 'a-verifier', 'a-csrf-state')

      expect(url).to include('state=a-csrf-state')
      expect(url).to include('code_challenge_method=S256')
    end
  end

  describe '#authenticate' do
    let(:admin_user) { create(:user, :global_admin) }

    context 'with a valid code, verifier, and admin claims' do
      before do
        allow_any_instance_of(described_class).to receive(:exchange_code).and_return({ 'access_token' => 'fake-token' })
        allow(Keycloak::JwtVerifier).to receive(:verify).and_return({ 'sub' => admin_user.keycloak_sub })
      end

      it 'returns a successful result with the admin user' do
        result = service.authenticate('a-code', 'a-verifier', 'https://app.example.com/admin/callback')

        expect(result.success?).to eq(true)
        expect(result.user).to eq(admin_user)
      end
    end

    context 'when the authenticated user is not a global admin' do
      let(:regular_user) { create(:user) }

      before do
        allow_any_instance_of(described_class).to receive(:exchange_code).and_return({ 'access_token' => 'fake-token' })
        allow(Keycloak::JwtVerifier).to receive(:verify).and_return({ 'sub' => regular_user.keycloak_sub })
      end

      it 'returns a failure result' do
        result = service.authenticate('a-code', 'a-verifier', 'https://app.example.com/admin/callback')

        expect(result.success?).to eq(false)
        expect(result.error).to eq('Access denied. Global admin role required.')
      end
    end

    context 'with no code' do
      it 'returns a failure result without attempting token exchange' do
        expect(service).not_to receive(:exchange_code)

        result = service.authenticate(nil, 'a-verifier', 'https://app.example.com/admin/callback')

        expect(result.success?).to eq(false)
        expect(result.error).to eq('No authorization code received')
      end
    end

    context 'with no code_verifier' do
      it 'returns a failure result without attempting token exchange' do
        expect(service).not_to receive(:exchange_code)

        result = service.authenticate('a-code', nil, 'https://app.example.com/admin/callback')

        expect(result.success?).to eq(false)
        expect(result.error).to eq('Session expired. Please try again.')
      end
    end

    # AIX-529 — token-exchange connectivity hardening. These exercise exchange_code's
    # real Net::HTTP path (explicit timeouts + one bounded retry) rather than stubbing
    # exchange_code, so Keycloak.configuration is doubled to a fixed token endpoint.
    context 'when hardening the Keycloak token-endpoint connection' do
      let(:token_url) { 'http://keycloak.test/realms/db90/protocol/openid-connect/token' }

      before do
        allow(Keycloak).to receive(:configuration)
          .and_return(double(internal_token_url: token_url, audience: 'db90-web'))
        # Don't actually sleep between connectivity retries.
        allow_any_instance_of(described_class).to receive(:sleep)
      end

      def http_response(klass, code, body)
        response = klass.new('1.1', code, '')
        allow(response).to receive(:body).and_return(body)
        response
      end

      context 'when the Keycloak token endpoint is unreachable' do
        before do
          allow(Net::HTTP).to receive(:start).and_raise(Errno::ECONNREFUSED)
        end

        it "returns a 'temporarily unavailable' failure (distinct from a bad code)" do
          result = service.authenticate('code', 'verifier', 'http://app.test/admin/callback')

          expect(result.success?).to be(false)
          expect(result.error).to match(/temporarily unavailable/i)
        end

        it 'does not attempt token verification' do
          expect(Keycloak::JwtVerifier).not_to receive(:verify)

          service.authenticate('code', 'verifier', 'http://app.test/admin/callback')
        end
      end

      context 'when Keycloak rejects the authorization code' do
        before do
          allow(Net::HTTP).to receive(:start)
            .and_return(http_response(Net::HTTPBadRequest, '400', '{"error":"invalid_grant"}'))
        end

        it 'returns a generic token-exchange failure' do
          result = service.authenticate('bad-code', 'verifier', 'http://app.test/admin/callback')

          expect(result.success?).to be(false)
          expect(result.error).to eq('Failed to obtain access token')
        end
      end

      context 'when the exchange succeeds for a global admin' do
        let(:admin) { create(:user, :global_admin) }
        let(:token_body) { { 'access_token' => 'at', 'expires_in' => 300 }.to_json }

        before do
          allow(Net::HTTP).to receive(:start).and_return(http_response(Net::HTTPOK, '200', token_body))
          # find_admin_user falls back to email lookup when keycloak_sub doesn't match.
          allow(Keycloak::JwtVerifier).to receive(:verify)
            .with('at').and_return({ 'sub' => 'kc-sub-unmatched', 'email' => admin.email })
        end

        it 'returns a successful result with the admin user' do
          result = service.authenticate('code', 'verifier', 'http://app.test/admin/callback')

          expect(result.success?).to be(true)
          expect(result.user).to eq(admin)
        end
      end
    end
  end
end

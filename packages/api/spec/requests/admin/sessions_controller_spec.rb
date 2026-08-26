# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Admin::Sessions', type: :request do
  let(:admin_user) { create(:user, :global_admin) }

  def state_from_redirect(location)
    Rack::Utils.parse_query(URI.parse(location).query)['state']
  end

  describe 'GET /admin/login' do
    it 'redirects to Keycloak with a state param stored in the session' do
      get '/admin/login'

      expect(response).to have_http_status(:found)
      state = state_from_redirect(response.location)
      expect(state).to be_present
    end
  end

  describe 'GET /admin/callback' do
    context 'with a matching state (the real round trip)' do
      before do
        allow_any_instance_of(Admin::KeycloakAuthService).to receive(:exchange_code).and_return({ 'access_token' => 'fake-token' })
        allow(Keycloak::JwtVerifier).to receive(:verify).and_return({ 'sub' => admin_user.keycloak_sub })
      end

      it 'logs the admin in with a working session cookie' do
        get '/admin/login'
        state = state_from_redirect(response.location)

        get '/admin/callback', params: { code: 'a-code', state: state }
        expect(response).to redirect_to('/admin')

        # Confirm the signed admin_user_id cookie actually works for a subsequent
        # admin request, rather than trying to decode Rack::Test's raw cookie jar
        # (Rack::Test::CookieJar has no #signed accessor — verified empirically).
        get admin_root_path
        expect(response).to have_http_status(:ok)
      end
    end

    context 'with a missing state' do
      it 'redirects to the login error page without attempting authentication' do
        get '/admin/login' # establishes session[:pkce_verifier] and session[:oauth_state]
        expect(Admin::KeycloakAuthService).not_to receive(:new)

        get '/admin/callback', params: { code: 'a-code' }

        expect(response).to redirect_to(%r{/admin/login\?error=})
      end
    end

    context 'with a state that does not match the one issued at /admin/login' do
      it 'redirects to the login error page without attempting authentication' do
        get '/admin/login'
        expect(Admin::KeycloakAuthService).not_to receive(:new)

        get '/admin/callback', params: { code: 'a-code', state: 'attacker-supplied-state' }

        expect(response).to redirect_to(%r{/admin/login\?error=})
      end
    end

    context 'replaying the same callback request twice (state already consumed)' do
      before do
        allow_any_instance_of(Admin::KeycloakAuthService).to receive(:exchange_code).and_return({ 'access_token' => 'fake-token' })
        allow(Keycloak::JwtVerifier).to receive(:verify).and_return({ 'sub' => admin_user.keycloak_sub })
      end

      it 'rejects the second attempt because the session state was already deleted' do
        get '/admin/login'
        state = state_from_redirect(response.location)

        get '/admin/callback', params: { code: 'a-code', state: state }
        expect(response).to redirect_to('/admin')

        get '/admin/callback', params: { code: 'a-code', state: state }
        expect(response).to redirect_to(%r{/admin/login\?error=})
      end
    end
  end
end

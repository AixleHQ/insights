# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Admin Authentication', type: :request do
  let(:regular_user) { create(:user) }
  let(:global_admin) { create(:user, :global_admin) }

  describe 'accessing admin panel' do
    it 'denies access to regular users' do
      # Simulate admin session
      allow_any_instance_of(Admin::ApplicationController).to receive(:current_admin_user).and_return(regular_user)

      get admin_root_path

      # In test/dev environment, redirects to login instead of 403
      expect(response).to redirect_to(login_path(redirect: admin_login_path))
    end

    it 'allows access to global admins' do
      allow_any_instance_of(Admin::ApplicationController).to receive(:current_admin_user).and_return(global_admin)

      get admin_root_path

      expect(response).to have_http_status(:ok)
    end

    it 'sets Cache-Control: no-store on admin HTML responses (AIX-589)' do
      allow_any_instance_of(Admin::ApplicationController).to receive(:current_admin_user).and_return(global_admin)

      get admin_root_path

      expect(response).to have_http_status(:ok)
      expect(response.headers['Cache-Control']).to include('no-store')
    end

    it 'denies access to unauthenticated users' do
      allow_any_instance_of(Admin::ApplicationController).to receive(:current_admin_user).and_return(nil)

      get admin_root_path

      # In test/dev environment, redirects to login instead of 403
      expect(response).to redirect_to(login_path(redirect: admin_login_path))
    end
  end

  describe 'JWT-based authentication (authenticate_from_jwt)' do
    # These tests deliberately do NOT mock current_admin_user.
    # They exercise the real authenticate_from_jwt code path.
    # Keycloak::JwtVerifier.verify is stubbed because Keycloak is not
    # running in the test environment.

    let(:admin_user) { create(:user, :global_admin) }
    let(:regular_user) { create(:user) }

    context 'when JwtVerifier returns valid claims for a global admin' do
      before do
        allow(Keycloak::JwtVerifier).to receive(:verify)
          .and_return({ 'sub' => admin_user.keycloak_sub })
      end

      it 'grants access to the admin panel' do
        get admin_root_path, headers: { 'Authorization' => 'Bearer valid.jwt.token' }
        expect(response).to have_http_status(:ok)
      end
    end

    context 'when JwtVerifier returns claims for a non-admin user' do
      before do
        allow(Keycloak::JwtVerifier).to receive(:verify)
          .and_return({ 'sub' => regular_user.keycloak_sub })
      end

      it 'redirects to login' do
        get admin_root_path, headers: { 'Authorization' => 'Bearer valid.jwt.token' }
        expect(response).to redirect_to(login_path(redirect: admin_login_path))
      end
    end

    context 'when JwtVerifier returns nil (forged / expired / wrong iss or aud)' do
      before do
        allow(Keycloak::JwtVerifier).to receive(:verify).and_return(nil)
      end

      it 'denies access and redirects to login' do
        get admin_root_path, headers: { 'Authorization' => 'Bearer forged.unsigned.token' }
        expect(response).to redirect_to(login_path(redirect: admin_login_path))
      end
    end

    context 'when JWT is supplied via the admin_token cookie' do
      before do
        allow(Keycloak::JwtVerifier).to receive(:verify)
          .and_return({ 'sub' => admin_user.keycloak_sub })
      end

      it 'grants access via cookie-borne JWT' do
        get admin_root_path, headers: { 'Cookie' => 'admin_token=valid.jwt.token' }
        expect(response).to have_http_status(:ok)
      end
    end

    context 'when JwtVerifier returns claims for an unrecognized keycloak_sub' do
      before do
        allow(Keycloak::JwtVerifier).to receive(:verify)
          .and_return({ 'sub' => 'unknown-uuid-not-in-db' })
      end

      it 'redirects to login' do
        get admin_root_path, headers: { 'Authorization' => 'Bearer valid.jwt.token' }
        expect(response).to redirect_to(login_path(redirect: admin_login_path))
      end
    end

    context 'when no JWT and no session cookie are present' do
      it 'redirects to login' do
        get admin_root_path
        expect(response).to redirect_to(login_path(redirect: admin_login_path))
      end
    end
  end

  describe 'logout (DELETE /admin/logout)' do
    let(:admin_user) { create(:user, :global_admin) }

    # Log in through the real callback so session[:admin_id_token] is populated.
    # Where the callback enforces an OAuth state check, stub it so these
    # logout-focused specs stay independent of the login state round-trip.
    def log_in_admin(id_token: 'the.id.token')
      if Admin::SessionsController.private_method_defined?(:valid_state?)
        allow_any_instance_of(Admin::SessionsController).to receive(:valid_state?).and_return(true)
      end
      allow_any_instance_of(Admin::KeycloakAuthService).to receive(:authenticate)
        .and_return(Admin::KeycloakAuthService::Result.new(success?: true, user: admin_user, id_token: id_token))
      get '/admin/callback', params: { code: 'irrelevant', state: 'stubbed' }
    end

    it 'terminates the signed-cookie admin session' do
      log_in_admin
      expect(response).to redirect_to('/admin')

      get admin_root_path
      expect(response).to have_http_status(:ok)

      delete '/admin/logout'
      # Cookie is cleared AND the browser is bounced to Keycloak to end the SSO session.
      expect(response).to redirect_to(%r{/protocol/openid-connect/logout})

      get admin_users_path
      expect(response).to redirect_to(login_path(redirect: admin_login_path))
    end

    it 'ends the Keycloak SSO session via RP-initiated logout with id_token_hint' do
      log_in_admin

      delete '/admin/logout'

      location = response.location
      expect(location).to include(Keycloak.configuration.end_session_url)
      expect(location).to include('id_token_hint=the.id.token')
      expect(location).to include('post_logout_redirect_uri=')
      # Decode the whole location so we can match the redirect target regardless of encoding.
      expect(CGI.unescape(location)).to include('/admin/login?notice=Logged+out+successfully')
    end

    it 'also clears the admin_token JWT fallback cookie' do
      allow(Keycloak::JwtVerifier).to receive(:verify)
        .and_return({ 'sub' => admin_user.keycloak_sub })
      cookies[:admin_token] = 'valid.jwt.token'
      get admin_root_path
      expect(response).to have_http_status(:ok)

      delete '/admin/logout'

      # This path never went through /admin/callback, so there's no id_token in the
      # session — logout must still redirect to Keycloak, just without id_token_hint.
      location = response.location
      expect(location).to include(Keycloak.configuration.end_session_url)
      expect(location).not_to include('id_token_hint')

      get admin_users_path
      expect(response).to redirect_to(login_path(redirect: admin_login_path))
    end

    it 'clears the admin session without Keycloak redirect when Accept is JSON (main-app logout)' do
      # Use log_in_admin so OAuth state validation (AIX-563) is stubbed — this
      # example is about JSON logout behavior, not the login round-trip.
      log_in_admin
      expect(response).to redirect_to('/admin')

      delete '/admin/logout', headers: { 'Accept' => 'application/json' }

      expect(response).to have_http_status(:no_content)
      expect(response.location).to be_blank

      get admin_users_path
      expect(response).to redirect_to(login_path(redirect: admin_login_path))
    end

    it 'stores a realistically-sized Keycloak id_token in the session without cookie overflow, and round-trips it on the next request' do
      # Shape/size representative of a real Keycloak ID token (header.claims.signature),
      # not the 12-byte 'the.id.token' stub used above — that stub can never trip a
      # cookie/header size overflow, which is exactly what broke staging for AIX-563.
      header = Base64.urlsafe_encode64({ alg: 'RS256', typ: 'JWT', kid: SecureRandom.hex(20) }.to_json, padding: false)
      claims = {
        exp: 1.hour.from_now.to_i, iat: Time.current.to_i, auth_time: Time.current.to_i,
        jti: SecureRandom.uuid, iss: 'https://keycloak.example.com/realms/db90',
        aud: 'db90-admin', sub: SecureRandom.uuid, typ: 'ID', azp: 'db90-admin',
        session_state: SecureRandom.uuid, at_hash: SecureRandom.hex(16), acr: '1', sid: SecureRandom.uuid,
        email_verified: true, name: 'Test Admin User', preferred_username: 'test.admin',
        given_name: 'Test', family_name: 'Admin', email: 'test.admin@example.com',
        realm_access: { roles: %w[offline_access uma_authorization global_admin default-roles-db90] },
        resource_access: {
          'db90-admin' => { roles: %w[admin] },
          account: { roles: %w[manage-account manage-account-links view-profile] }
        }
      }.to_json
      payload = Base64.urlsafe_encode64(claims, padding: false)
      signature = Base64.urlsafe_encode64(SecureRandom.random_bytes(256), padding: false)
      realistic_id_token = "#{header}.#{payload}.#{signature}"
      expect(realistic_id_token.bytesize).to be > 1000

      log_in_admin(id_token: realistic_id_token)
      expect(response).to redirect_to('/admin')

      session_cookie = response.headers['Set-Cookie'].to_s[/_db90_admin_session=[^;]+/]
      expect(session_cookie.to_s.bytesize).to be < 1024 # opaque session id, not the raw JWT

      delete '/admin/logout'
      expect(response).to redirect_to(%r{/protocol/openid-connect/logout})
      expect(CGI.unescape(response.location)).to include("id_token_hint=#{realistic_id_token}")
    end
  end

  describe 'admin resources' do
    before do
      allow_any_instance_of(Admin::ApplicationController).to receive(:current_admin_user).and_return(global_admin)
    end

    it 'allows listing users' do
      create_list(:user, 3)

      get admin_users_path

      expect(response).to have_http_status(:ok)
    end

    it 'allows listing organizations' do
      create_list(:organization, 3)

      get admin_organizations_path

      expect(response).to have_http_status(:ok)
    end

    it 'allows viewing audit logs' do
      get admin_audit_logs_path

      expect(response).to have_http_status(:ok)
    end

    it 'allows viewing admin audit logs' do
      get admin_admin_audit_logs_path

      expect(response).to have_http_status(:ok)
    end
  end
end

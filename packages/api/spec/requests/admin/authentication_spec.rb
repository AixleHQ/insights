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
      expect(response).to redirect_to('/admin/login')
    end

    it 'allows access to global admins' do
      allow_any_instance_of(Admin::ApplicationController).to receive(:current_admin_user).and_return(global_admin)

      get admin_root_path

      expect(response).to have_http_status(:ok)
    end

    it 'denies access to unauthenticated users' do
      allow_any_instance_of(Admin::ApplicationController).to receive(:current_admin_user).and_return(nil)

      get admin_root_path

      # In test/dev environment, redirects to login instead of 403
      expect(response).to redirect_to('/admin/login')
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
        expect(response).to redirect_to('/admin/login')
      end
    end

    context 'when JwtVerifier returns nil (forged / expired / wrong iss or aud)' do
      before do
        allow(Keycloak::JwtVerifier).to receive(:verify).and_return(nil)
      end

      it 'denies access and redirects to login' do
        get admin_root_path, headers: { 'Authorization' => 'Bearer forged.unsigned.token' }
        expect(response).to redirect_to('/admin/login')
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
        expect(response).to redirect_to('/admin/login')
      end
    end

    context 'when no JWT and no session cookie are present' do
      it 'redirects to login' do
        get admin_root_path
        expect(response).to redirect_to('/admin/login')
      end
    end
  end

  describe 'logout (DELETE /admin/logout)' do
    let(:admin_user) { create(:user, :global_admin) }

    it 'terminates the signed-cookie admin session' do
      allow_any_instance_of(Admin::KeycloakAuthService).to receive(:authenticate)
        .and_return(Admin::KeycloakAuthService::Result.new(success?: true, user: admin_user, id_token: 'the.id.token'))
      get '/admin/callback', params: { code: 'irrelevant' }
      expect(response).to redirect_to('/admin')

      get admin_root_path
      expect(response).to have_http_status(:ok)

      delete '/admin/logout'
      # Cookie is cleared AND the browser is bounced to Keycloak to end the SSO session.
      expect(response).to redirect_to(%r{/protocol/openid-connect/logout})

      get admin_users_path
      expect(response).to redirect_to('/admin/login')
    end

    it 'ends the Keycloak SSO session via RP-initiated logout with id_token_hint' do
      allow_any_instance_of(Admin::KeycloakAuthService).to receive(:authenticate)
        .and_return(Admin::KeycloakAuthService::Result.new(success?: true, user: admin_user, id_token: 'the.id.token'))
      get '/admin/callback', params: { code: 'irrelevant' }

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

      get admin_users_path
      expect(response).to redirect_to('/admin/login')
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

# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Api::V1::Users', type: :request do
  let(:user) { create(:user) }
  let(:other_user) { create(:user) }

  describe 'GET /api/v1/users/me' do
    it 'returns the current user' do
      authenticated_get '/api/v1/users/me', user: user

      expect_success
      expect(json_data[:id]).to eq(user.id)
      expect(json_data[:email]).to eq(user.email)
    end

    it 'includes settings hash in response' do
      create(:user_setting, user: user, key: 'theme', value: 'dark')

      authenticated_get '/api/v1/users/me', user: user

      expect_success
      expect(json_data[:settings]).to eq({ theme: 'dark' })
    end

    it 'returns empty settings hash when user has no settings' do
      authenticated_get '/api/v1/users/me', user: user

      expect_success
      expect(json_data[:settings]).to eq({})
    end

    it 'returns unauthorized without authentication' do
      get '/api/v1/users/me'

      expect_unauthorized
    end
  end

  describe 'PATCH /api/v1/users/me' do
    it 'updates the current user' do
      authenticated_patch '/api/v1/users/me', user: user, params: { name: 'New Name' }

      expect_success
      expect(json_data[:name]).to eq('New Name')
      expect(user.reload.name).to eq('New Name')
    end

    it 'updates the avatar_url' do
      authenticated_patch '/api/v1/users/me', user: user, params: { avatar_url: 'https://example.com/avatar.png' }

      expect_success
      expect(json_data[:avatarUrl]).to eq('https://example.com/avatar.png')
      expect(user.reload.avatar_url).to eq('https://example.com/avatar.png')
    end

    it 'updates name and avatar_url together' do
      authenticated_patch '/api/v1/users/me', user: user, params: { name: 'New Name', avatar_url: 'https://example.com/avatar.png' }

      expect_success
      expect(json_data[:name]).to eq('New Name')
      expect(json_data[:avatarUrl]).to eq('https://example.com/avatar.png')
    end

    it 'does not allow updating email directly' do
      old_email = user.email
      authenticated_patch '/api/v1/users/me', user: user, params: { email: 'new@example.com' }

      expect_success
      expect(user.reload.email).to eq(old_email)
    end
  end

  describe 'GET /api/v1/users/me/organizations' do
    let!(:organization) { create(:organization) }
    let!(:membership) { create(:organization_membership, user: user, organization: organization) }

    it 'returns the user organizations' do
      authenticated_get '/api/v1/users/me/organizations', user: user

      expect_success
      expect(json_data.length).to eq(1)
      expect(json_data.first[:id]).to eq(organization.id)
    end
  end

  describe 'GET /api/v1/users/me/tool_accounts' do
    let(:organization) { create(:organization) }
    let!(:membership) { create(:organization_membership, user: user, organization: organization) }

    it 'returns bad request without organization header' do
      authenticated_get '/api/v1/users/me/tool_accounts', user: user

      expect_bad_request
    end

    it 'returns forbidden when organization is not accessible' do
      other_org = create(:organization)

      authenticated_get '/api/v1/users/me/tool_accounts', user: user, organization: other_org

      expect_forbidden
    end

    it 'returns unauthorized without authentication' do
      get '/api/v1/users/me/tool_accounts', headers: { 'X-Organization-ID' => organization.id }

      expect_unauthorized
    end

    context 'with organization header' do
      before do
        create(:user_tool_account, organization_membership: membership, tool_name: 'claude_code')
        create(:user_tool_account, :cursor, organization_membership: membership)
        create(:user_tool_account, :github_copilot, organization_membership: membership)
      end

      it 'returns only ingest-capable tool accounts for the current membership' do
        authenticated_get '/api/v1/users/me/tool_accounts', user: user, organization: organization

        expect_success
        names = json_data.map { |row| row[:toolName] }
        expect(names).to contain_exactly('claude_code', 'cursor')
      end

      it 'does not return another user ingest account in the same organization' do
        other_membership = create(:organization_membership, user: other_user, organization: organization)
        create(:user_tool_account, organization_membership: other_membership, tool_name: 'claude_code')

        authenticated_get '/api/v1/users/me/tool_accounts', user: user, organization: organization

        expect_success
        account_ids = json_data.map { |row| row[:id] }
        expect(account_ids).to match_array(membership.user_tool_accounts.where(tool_name: UserToolAccount::INGEST_TOOLS).pluck(:id))
      end

      it 'does not expose token fields in list payload' do
        authenticated_get '/api/v1/users/me/tool_accounts', user: user, organization: organization

        expect_success
        forbidden_keys = %i[ingestToken accessToken refreshToken tokenHash access_token]
        json_data.each do |row|
          expect(row.keys & forbidden_keys).to be_empty
        end
      end

      it 'returns lastUsedAt from the latest matching tool event' do
        create(:tool_event, user: user, organization: organization, tool_name: 'claude_code', occurred_at: 3.days.ago)
        create(:tool_event, user: user, organization: organization, tool_name: 'claude_code', occurred_at: 1.day.ago)

        authenticated_get '/api/v1/users/me/tool_accounts', user: user, organization: organization

        expect_success
        claude = json_data.find { |r| r[:toolName] == 'claude_code' }
        expect(Time.zone.parse(claude[:lastUsedAt])).to be_within(2.seconds).of(1.day.ago)
      end

      it 'does not attribute another user tool events to lastUsedAt' do
        other = create(:user)
        create(:organization_membership, user: other, organization: organization)
        create(:tool_event, user: other, organization: organization, tool_name: 'claude_code', occurred_at: Time.current)

        authenticated_get '/api/v1/users/me/tool_accounts', user: user, organization: organization

        expect_success
        claude = json_data.find { |r| r[:toolName] == 'claude_code' }
        expect(claude[:lastUsedAt]).to be_nil
      end

      it 'scopes lastUsedAt to the current organization' do
        create(:tool_event, user: user, organization: organization, tool_name: 'claude_code', occurred_at: 1.hour.ago)

        other_org = create(:organization)
        create(:organization_membership, user: user, organization: other_org)
        create(:tool_event, user: user, organization: other_org, tool_name: 'claude_code', occurred_at: 10.seconds.ago)

        authenticated_get '/api/v1/users/me/tool_accounts', user: user, organization: organization

        expect_success
        claude = json_data.find { |r| r[:toolName] == 'claude_code' }
        expect(Time.zone.parse(claude[:lastUsedAt])).to be_within(2.seconds).of(1.hour.ago)
      end
    end
  end

  describe 'GET /api/v1/users/me/settings' do
    let!(:setting) { create(:user_setting, user: user, key: 'theme', value: 'dark') }

    it 'returns user settings' do
      authenticated_get '/api/v1/users/me/settings', user: user

      expect_success
      expect(json_data.length).to eq(1)
      expect(json_data.first[:key]).to eq('theme')
      expect(json_data.first[:value]).to eq('dark')
    end
  end

  describe 'PUT /api/v1/users/me/settings/:key' do
    it 'creates a new setting' do
      authenticated_put '/api/v1/users/me/settings/theme', user: user, params: { value: 'light' }

      expect_success
      expect(json_data[:key]).to eq('theme')
      expect(json_data[:value]).to eq('light')
    end

    it 'updates an existing setting' do
      create(:user_setting, user: user, key: 'theme', value: 'dark')

      authenticated_put '/api/v1/users/me/settings/theme', user: user, params: { value: 'light' }

      expect_success
      expect(json_data[:value]).to eq('light')
    end

    context 'theme validation' do
      it 'accepts valid theme values' do
        %w[light dark system].each do |theme|
          authenticated_put '/api/v1/users/me/settings/theme', user: user, params: { value: theme }

          expect_success
          expect(json_data[:value]).to eq(theme)
        end
      end

      it 'rejects invalid theme values' do
        authenticated_put '/api/v1/users/me/settings/theme', user: user, params: { value: 'purple' }

        expect_unprocessable
        expect(json_response[:errors][:value]).to include('must be one of: light, dark, system')
      end
    end

    context 'default_org_id validation' do
      let!(:org) { create(:organization) }
      let!(:_membership) { create(:organization_membership, user: user, organization: org) }
      let!(:other_org) { create(:organization) }

      it 'accepts an org the user belongs to' do
        authenticated_put '/api/v1/users/me/settings/default_org_id', user: user, params: { value: org.id }

        expect_success
        expect(json_data[:value]).to eq(org.id)
      end

      it 'rejects an org the user does not belong to' do
        authenticated_put '/api/v1/users/me/settings/default_org_id', user: user, params: { value: other_org.id }

        expect_unprocessable
        expect(json_response[:errors][:value]).to include('must be a valid organization you belong to')
      end
    end

    context 'notification key validation' do
      %w[notify_in_app_risk notify_in_app_cost notify_email_digest notify_email_alerts].each do |key|
        it "accepts true for #{key}" do
          authenticated_put "/api/v1/users/me/settings/#{key}", user: user, params: { value: 'true' }

          expect_success
          expect(json_data[:value]).to eq('true')
        end

        it "accepts false for #{key}" do
          authenticated_put "/api/v1/users/me/settings/#{key}", user: user, params: { value: 'false' }

          expect_success
          expect(json_data[:value]).to eq('false')
        end

        it "rejects invalid value for #{key}" do
          authenticated_put "/api/v1/users/me/settings/#{key}", user: user, params: { value: 'yes' }

          expect_unprocessable
          expect(json_response[:errors][:value]).to include('must be true or false')
        end
      end
    end
  end

  describe 'DELETE /api/v1/users/me/settings/:key' do
    let!(:setting) { create(:user_setting, user: user, key: 'theme', value: 'dark') }

    it 'deletes the setting' do
      authenticated_delete '/api/v1/users/me/settings/theme', user: user

      expect_no_content
      expect(user.user_settings.find_by(key: 'theme')).to be_nil
    end

    it 'returns 404 for non-existent setting' do
      authenticated_delete '/api/v1/users/me/settings/nonexistent', user: user

      expect_not_found
    end
  end

  describe 'POST /api/v1/users/me/stop_impersonation' do
    let(:admin) { create(:user, global_admin: true) }
    let!(:organization) { create(:organization) }
    let!(:membership) { create(:organization_membership, user: user, organization: organization) }

    context 'when in impersonation mode' do
      it 'logs impersonation.ended and returns success' do
        expect {
          impersonated_post '/api/v1/users/me/stop_impersonation',
                           user: user,
                           impersonator: admin
        }.to change(OrganizationAuditLog, :count).by(1)

        expect_success
        expect(json_data[:success]).to be true

        log = OrganizationAuditLog.last
        expect(log.action).to eq('impersonation.ended')
        expect(log.actor_id).to eq(admin.id)
        expect(log.organization_id).to eq(organization.id)
        expect(log.resource_type).to eq('User')
        expect(log.resource_id).to eq(user.id)
      end

      it 'logs to all organizations the user belongs to' do
        other_org = create(:organization)
        create(:organization_membership, user: user, organization: other_org)

        expect {
          impersonated_post '/api/v1/users/me/stop_impersonation',
                           user: user,
                           impersonator: admin
        }.to change(OrganizationAuditLog, :count).by(2)
      end

      it 'logs impersonation.ended to each project the user belongs to' do
        project = create(:project, organization: organization)
        create(:project_membership, user: user, project: project, role: 'member')

        expect {
          impersonated_post '/api/v1/users/me/stop_impersonation',
                           user: user,
                           impersonator: admin
        }.to change(ProjectAuditLog, :count).by(1)

        log = ProjectAuditLog.last
        expect(log.action).to eq('impersonation.ended')
        expect(log.project).to eq(project)
        expect(log.actor).to eq(admin)
        expect(log.resource_type).to eq('User')
        expect(log.resource_id).to eq(user.id)
      end
    end

    context 'when not in impersonation mode' do
      it 'returns bad request' do
        authenticated_post '/api/v1/users/me/stop_impersonation', user: user

        expect_bad_request
        expect(json_response[:error]).to eq('Not in impersonation mode')
      end
    end

    context 'token revocation' do
      let(:jti) { SecureRandom.uuid }

      after { REDIS.del("impersonation:jti:#{jti}") }

      it 'adds the jti to the Redis blocklist' do
        impersonated_post_with_jti '/api/v1/users/me/stop_impersonation',
                                   user: user,
                                   impersonator: admin,
                                   jti: jti

        expect_success
        expect(ImpersonationService.revoked?(jti)).to be true
      end
    end

    context 'when claims are missing jti' do
      it 'returns unprocessable_content' do
        # Uses the special test-impersonation-nojti- token which the TestJwtAuthMiddleware
        # sets jwt.impersonation = true but omits the jti claim.
        headers = {
          'Authorization' => "Bearer test-impersonation-nojti-#{user.id}-by-#{admin.id}",
          'Content-Type' => 'application/json'
        }
        post '/api/v1/users/me/stop_impersonation', headers: headers

        expect(response).to have_http_status(:unprocessable_content)
        expect(json_response[:error]).to eq('Token missing jti claim')
      end
    end
  end
end

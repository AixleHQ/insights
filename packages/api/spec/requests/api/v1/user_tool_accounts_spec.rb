# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Api::V1::UserToolAccounts', type: :request do
  let(:user) { create(:user) }
  let(:other_user) { create(:user) }
  let(:organization) { create(:organization) }
  let!(:membership) { create(:organization_membership, user: user, organization: organization) }
  let!(:other_membership) { create(:organization_membership, user: other_user, organization: organization) }
  let!(:tool_account) { create(:user_tool_account, organization_membership: membership, tool_name: 'claude_code') }

  describe 'GET /api/v1/organizations/:organization_id/tool_accounts' do
    it 'returns user tool accounts for the current membership' do
      authenticated_get "/api/v1/organizations/#{organization.id}/tool_accounts",
                        user: user,
                        organization: organization

      expect_success
      expect(json_data.length).to eq(1)
      expect(json_data.first[:toolName]).to eq('claude_code')
    end

    it 'does not return other users tool accounts' do
      create(:user_tool_account, organization_membership: other_membership, tool_name: 'cursor')

      authenticated_get "/api/v1/organizations/#{organization.id}/tool_accounts",
                        user: user,
                        organization: organization

      expect_success
      expect(json_data.length).to eq(1)
    end

    it 'filters by tool name' do
      create(:user_tool_account, organization_membership: membership, tool_name: 'cursor')

      authenticated_get "/api/v1/organizations/#{organization.id}/tool_accounts",
                        user: user,
                        organization: organization,
                        params: { tool: 'claude_code' }

      expect_success
      expect(json_data.length).to eq(1)
      expect(json_data.first[:toolName]).to eq('claude_code')
    end
  end

  describe 'GET /api/v1/organizations/:organization_id/tool_accounts/:id' do
    it 'returns the tool account' do
      authenticated_get "/api/v1/organizations/#{organization.id}/tool_accounts/#{tool_account.id}",
                        user: user,
                        organization: organization

      expect_success
      expect(json_data[:id]).to eq(tool_account.id)
    end

    it 'does not expose tokens' do
      authenticated_get "/api/v1/organizations/#{organization.id}/tool_accounts/#{tool_account.id}",
                        user: user,
                        organization: organization

      expect_success
      expect(json_data).not_to have_key(:accessToken)
      expect(json_data).not_to have_key(:refreshToken)
    end
  end

  describe 'POST /api/v1/organizations/:organization_id/tool_accounts' do
    it 'creates a tool account' do
      authenticated_post "/api/v1/organizations/#{organization.id}/tool_accounts",
                         user: user,
                         organization: organization,
                         params: { tool_name: 'cursor', access_token: 'secret' }

      expect_created
      expect(json_data[:toolName]).to eq('cursor')
    end

    it 'creates a tool_account.create audit log without secrets' do
      expect {
        authenticated_post "/api/v1/organizations/#{organization.id}/tool_accounts",
                           user: user,
                           organization: organization,
                           params: { tool_name: 'windsurf', access_token: 'secret' }
      }.to change(OrganizationAuditLog, :count).by(1)

      log = OrganizationAuditLog.last
      expect(log.action).to eq('tool_account.create')
      expect(log.tracked_changes.to_s).not_to include('secret')
    end

    it 'prevents duplicate tool accounts' do
      authenticated_post "/api/v1/organizations/#{organization.id}/tool_accounts",
                         user: user,
                         organization: organization,
                         params: { tool_name: 'claude_code' }

      expect_unprocessable
    end

    context 'for ingest tools' do
      it 'includes ingestToken in the response for cursor' do
        authenticated_post "/api/v1/organizations/#{organization.id}/tool_accounts",
                           user: user,
                           organization: organization,
                           params: { tool_name: 'cursor' }

        expect_created
        expect(json_data[:ingestToken]).to be_present
        expect(json_data[:ingestToken]).to start_with('db90_')
      end

      it 'creates ingest accounts as inactive until the first successful ingest event' do
        authenticated_post "/api/v1/organizations/#{organization.id}/tool_accounts",
                           user: user,
                           organization: organization,
                           params: { tool_name: 'cursor' }

        expect_created
        expect(json_data[:connectionState]).to eq('waiting_for_connection')
      end

      it 'includes ingestToken in the response for claude_code' do
        tool_account.destroy! # remove the existing cursor account

        authenticated_post "/api/v1/organizations/#{organization.id}/tool_accounts",
                           user: user,
                           organization: organization,
                           params: { tool_name: 'claude_code' }

        expect_created
        expect(json_data[:ingestToken]).to be_present
        expect(json_data[:ingestToken]).to start_with('db90_')
      end
    end

    context 'for non-ingest tools' do
      it 'does not include ingestToken in the response for windsurf' do
        authenticated_post "/api/v1/organizations/#{organization.id}/tool_accounts",
                           user: user,
                           organization: organization,
                           params: { tool_name: 'windsurf', access_token: 'some_token' }

        expect_created
        expect(json_data).not_to have_key(:ingestToken)
      end
    end
  end

  describe 'PATCH /api/v1/organizations/:organization_id/tool_accounts/:id' do
    it 'updates the tool account' do
      authenticated_patch "/api/v1/organizations/#{organization.id}/tool_accounts/#{tool_account.id}",
                          user: user,
                          organization: organization,
                          params: { connection_state: 'inactive' }

      expect_success
      expect(json_data[:connectionState]).to eq('inactive')
    end

    it 're-enables a disabled tool account' do
      tool_account.deactivate_connection!

      authenticated_patch "/api/v1/organizations/#{organization.id}/tool_accounts/#{tool_account.id}",
                          user: user,
                          organization: organization,
                          params: { connection_state: 'active' }

      expect_success
      expect(json_data[:connectionState]).to eq('active')
    end

    it 'persists connection_state change to the database' do
      authenticated_patch "/api/v1/organizations/#{organization.id}/tool_accounts/#{tool_account.id}",
                          user: user,
                          organization: organization,
                          params: { connection_state: 'inactive' }

      expect_success
      expect(tool_account.reload.connection_state).to eq('inactive')
    end

    it 'returns 422 for an invalid connection_state' do
      original_state = tool_account.connection_state

      authenticated_patch "/api/v1/organizations/#{organization.id}/tool_accounts/#{tool_account.id}",
                          user: user,
                          organization: organization,
                          params: { connection_state: 'paused' }

      expect_unprocessable
      expect(json_response[:errors][:connection_state]).to include('Connection state is not included in the list')
      expect(tool_account.reload.connection_state).to eq(original_state)
    end

    it 'creates a tool_account.update audit log' do
      expect {
        authenticated_patch "/api/v1/organizations/#{organization.id}/tool_accounts/#{tool_account.id}",
                            user: user,
                            organization: organization,
                            params: { connection_state: 'inactive' }
      }.to change(OrganizationAuditLog, :count).by(1)

      expect(OrganizationAuditLog.last.action).to eq('tool_account.update')
    end

    it 'succeeds silently when connection_state is already at the requested value' do
      tool_account.activate_connection! if tool_account.may_activate_connection?

      authenticated_patch "/api/v1/organizations/#{organization.id}/tool_accounts/#{tool_account.id}",
                          user: user,
                          organization: organization,
                          params: { connection_state: 'active' }

      expect_success
      expect(json_data[:connectionState]).to eq('active')
    end

    it 'does not allow another user to update the account' do
      authenticated_patch "/api/v1/organizations/#{organization.id}/tool_accounts/#{tool_account.id}",
                          user: other_user,
                          organization: organization,
                          params: { connection_state: 'inactive' }

      expect(response).to have_http_status(:not_found)
    end
  end

  describe 'DELETE /api/v1/organizations/:organization_id/tool_accounts/:id' do
    it 'deletes the tool account' do
      authenticated_delete "/api/v1/organizations/#{organization.id}/tool_accounts/#{tool_account.id}",
                           user: user,
                           organization: organization

      expect_no_content
      expect(UserToolAccount.find_by(id: tool_account.id)).to be_nil
    end

    it 'creates a tool_account.delete audit log' do
      expect {
        authenticated_delete "/api/v1/organizations/#{organization.id}/tool_accounts/#{tool_account.id}",
                             user: user,
                             organization: organization
      }.to change(OrganizationAuditLog, :count).by(1)

      expect(OrganizationAuditLog.last.action).to eq('tool_account.delete')
    end

    it 'does not allow another user to delete the account' do
      authenticated_delete "/api/v1/organizations/#{organization.id}/tool_accounts/#{tool_account.id}",
                           user: other_user,
                           organization: organization

      expect(response).to have_http_status(:not_found)
    end
  end

  describe 'POST /api/v1/organizations/:organization_id/tool_accounts/:id/regenerate_token' do
    it 'returns a new ingestToken in the response' do
      authenticated_post "/api/v1/organizations/#{organization.id}/tool_accounts/#{tool_account.id}/regenerate_token",
                         user: user,
                         organization: organization

      expect_success
      expect(json_data[:ingestToken]).to be_present
      expect(json_data[:ingestToken]).to start_with('db90_')
    end

    it 'creates a tool_account.regenerate audit log without the token value' do
      expect {
        authenticated_post "/api/v1/organizations/#{organization.id}/tool_accounts/#{tool_account.id}/regenerate_token",
                           user: user,
                           organization: organization
      }.to change(OrganizationAuditLog, :count).by(1)

      log = OrganizationAuditLog.last
      expect(log.action).to eq('tool_account.regenerate')
      expect(log.tracked_changes.to_s).not_to include('db90_')
    end

    it 'issues a different token each time' do
      old_token = tool_account.plaintext_token

      authenticated_post "/api/v1/organizations/#{organization.id}/tool_accounts/#{tool_account.id}/regenerate_token",
                         user: user,
                         organization: organization

      expect_success
      expect(json_data[:ingestToken]).not_to eq(old_token)
    end

    it 'old token no longer authenticates on ingest endpoint after regeneration' do
      old_token = tool_account.plaintext_token

      authenticated_post "/api/v1/organizations/#{organization.id}/tool_accounts/#{tool_account.id}/regenerate_token",
                         user: user,
                         organization: organization
      expect_success

      post '/api/v1/ingest/events',
           params: { event_type: 'completion' }.to_json,
           headers: { 'Content-Type' => 'application/json', 'Authorization' => "Bearer #{old_token}" }

      expect(response).to have_http_status(:unauthorized)
    end

    it 'new token authenticates on ingest endpoint after regeneration' do
      allow(RawEventStore).to receive(:ensure_bucket_exists!).and_return(nil)
      allow(RawEventStore).to receive(:store).and_return('events/test-key.json')
      allow(Temporal::Client).to receive(:start_workflow).and_return({ workflow_id: 'test-id' })

      authenticated_post "/api/v1/organizations/#{organization.id}/tool_accounts/#{tool_account.id}/regenerate_token",
                         user: user,
                         organization: organization
      expect_success

      new_token = json_data[:ingestToken]

      post '/api/v1/ingest/events',
           params: { event_type: 'completion' }.to_json,
           headers: { 'Content-Type' => 'application/json', 'Authorization' => "Bearer #{new_token}" }

      expect(response).to have_http_status(:accepted)
    end

    it 'does not allow another user to regenerate the token' do
      authenticated_post "/api/v1/organizations/#{organization.id}/tool_accounts/#{tool_account.id}/regenerate_token",
                         user: other_user,
                         organization: organization

      expect(response).to have_http_status(:not_found)
    end
  end

  describe 'scope field in serialized response' do
    it 'returns scope=persona for tool accounts' do
      authenticated_get "/api/v1/organizations/#{organization.id}/tool_accounts/#{tool_account.id}",
                        user: user,
                        organization: organization

      expect_success
      expect(json_data[:scope]).to eq('persona')
    end

    it 'includes scope in the list response' do
      authenticated_get "/api/v1/organizations/#{organization.id}/tool_accounts",
                        user: user,
                        organization: organization

      expect_success
      expect(json_data.first).to have_key(:scope)
      expect(json_data.first[:scope]).to eq('persona')
    end
  end
end

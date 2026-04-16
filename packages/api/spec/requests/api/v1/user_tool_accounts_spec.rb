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

    it 'prevents duplicate tool accounts' do
      authenticated_post "/api/v1/organizations/#{organization.id}/tool_accounts",
                         user: user,
                         organization: organization,
                         params: { tool_name: 'claude_code' }

      expect_unprocessable
    end

    context 'for ingest tools' do
      it 'includes ingestToken in the response for claude_code' do
        authenticated_post "/api/v1/organizations/#{organization.id}/tool_accounts",
                           user: user,
                           organization: organization,
                           params: { tool_name: 'cursor' }

        expect_created
        expect(json_data[:ingestToken]).to be_present
        expect(json_data[:ingestToken]).to start_with('db90_')
      end

      it 'includes ingestToken in the response for cursor' do
        tool_account.destroy! # remove the existing claude_code account

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
                          params: { is_active: false }

      expect_success
      expect(json_data[:isActive]).to be false
    end

    it 're-enables a disabled tool account' do
      tool_account.update!(is_active: false)

      authenticated_patch "/api/v1/organizations/#{organization.id}/tool_accounts/#{tool_account.id}",
                          user: user,
                          organization: organization,
                          params: { is_active: true }

      expect_success
      expect(json_data[:isActive]).to be true
    end

    it 'persists is_active change to the database' do
      authenticated_patch "/api/v1/organizations/#{organization.id}/tool_accounts/#{tool_account.id}",
                          user: user,
                          organization: organization,
                          params: { is_active: false }

      expect_success
      expect(tool_account.reload.is_active).to be false
    end

    it 'does not allow another user to update the account' do
      authenticated_patch "/api/v1/organizations/#{organization.id}/tool_accounts/#{tool_account.id}",
                          user: other_user,
                          organization: organization,
                          params: { is_active: false }

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
end

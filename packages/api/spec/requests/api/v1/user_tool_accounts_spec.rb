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
  end

  describe 'DELETE /api/v1/organizations/:organization_id/tool_accounts/:id' do
    it 'deletes the tool account' do
      authenticated_delete "/api/v1/organizations/#{organization.id}/tool_accounts/#{tool_account.id}",
                           user: user,
                           organization: organization

      expect_no_content
      expect(UserToolAccount.find_by(id: tool_account.id)).to be_nil
    end
  end
end

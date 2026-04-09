# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Api::V1::OrganizationMembers', type: :request do
  let(:owner) { create(:user) }
  let(:admin) { create(:user) }
  let(:member) { create(:user) }
  let(:organization) { create(:organization) }
  let!(:owner_membership) { create(:organization_membership, user: owner, organization: organization, role: 'owner') }
  let!(:admin_membership) { create(:organization_membership, user: admin, organization: organization, role: 'admin') }
  let!(:member_membership) { create(:organization_membership, user: member, organization: organization, role: 'member') }

  describe 'GET /api/v1/organizations/:organization_id/members' do
    it 'returns all members' do
      authenticated_get "/api/v1/organizations/#{organization.id}/members",
                        user: member,
                        organization: organization

      expect_success
      expect(json_data.length).to eq(3)
    end

    it 'includes total_tokens for each member' do
      # Create some tool events for a member
      create(:tool_event,
             organization: organization,
             user: member,
             tokens_in: 100,
             tokens_out: 200)
      create(:tool_event,
             organization: organization,
             user: member,
             tokens_in: 50,
             tokens_out: 150)

      authenticated_get "/api/v1/organizations/#{organization.id}/members",
                        user: member,
                        organization: organization

      expect_success
      member_data = json_data.find { |m| m[:user][:email] == member.email }
      expect(member_data[:total_tokens]).to eq(500) # 100+200+50+150
    end

    it 'includes last_active_at from user login' do
      member.update!(last_login_at: 1.hour.ago)

      authenticated_get "/api/v1/organizations/#{organization.id}/members",
                        user: member,
                        organization: organization

      expect_success
      member_data = json_data.find { |m| m[:user][:email] == member.email }
      expect(member_data[:last_active_at]).to be_present
    end

    it 'returns 0 tokens for members with no events' do
      authenticated_get "/api/v1/organizations/#{organization.id}/members",
                        user: member,
                        organization: organization

      expect_success
      member_data = json_data.find { |m| m[:user][:email] == member.email }
      expect(member_data[:total_tokens]).to eq(0)
    end

    it 'filters by role' do
      authenticated_get "/api/v1/organizations/#{organization.id}/members",
                        user: member,
                        organization: organization,
                        params: { role: 'admin' }

      expect_success
      expect(json_data.length).to eq(1)
      expect(json_data.first[:role]).to eq('admin')
    end

    it 'requires organization context' do
      authenticated_get "/api/v1/organizations/#{organization.id}/members", user: member

      expect_bad_request
    end
  end

  describe 'GET /api/v1/organizations/:organization_id/members/:id' do
    it 'returns the membership by membership id' do
      authenticated_get "/api/v1/organizations/#{organization.id}/members/#{member_membership.id}",
                        user: member,
                        organization: organization

      expect_success
      expect(json_data[:id]).to eq(member_membership.id)
    end

    it 'returns the membership when :id is the user uuid' do
      authenticated_get "/api/v1/organizations/#{organization.id}/members/#{member.id}",
                        user: member,
                        organization: organization

      expect_success
      expect(json_data[:id]).to eq(member_membership.id)
    end

    it 'returns 404 when neither membership id nor user id matches' do
      authenticated_get "/api/v1/organizations/#{organization.id}/members/nonexistent-id",
                        user: member,
                        organization: organization

      expect_not_found
    end
  end

  describe 'POST /api/v1/organizations/:organization_id/members' do
    let(:new_user) { create(:user) }

    it 'creates a new membership as admin' do
      authenticated_post "/api/v1/organizations/#{organization.id}/members",
                         user: admin,
                         organization: organization,
                         params: { user_id: new_user.id, role: 'member' }

      expect_created
      expect(json_data[:role]).to eq('member')
    end

    it 'returns 403 for non-admins' do
      authenticated_post "/api/v1/organizations/#{organization.id}/members",
                         user: member,
                         organization: organization,
                         params: { user_id: new_user.id, role: 'member' }

      expect_forbidden
    end
  end

  describe 'PATCH /api/v1/organizations/:organization_id/members/:id' do
    it 'updates member role as admin' do
      authenticated_patch "/api/v1/organizations/#{organization.id}/members/#{member_membership.id}",
                          user: admin,
                          organization: organization,
                          params: { role: 'viewer' }

      expect_success
      expect(json_data[:role]).to eq('viewer')
    end

    it 'cannot demote an owner unless also an owner' do
      authenticated_patch "/api/v1/organizations/#{organization.id}/members/#{owner_membership.id}",
                          user: admin,
                          organization: organization,
                          params: { role: 'admin' }

      expect_forbidden
    end

    it 'allows owner to demote another owner' do
      other_owner = create(:user)
      other_owner_membership = create(:organization_membership, user: other_owner, organization: organization, role: 'owner')

      authenticated_patch "/api/v1/organizations/#{organization.id}/members/#{other_owner_membership.id}",
                          user: owner,
                          organization: organization,
                          params: { role: 'admin' }

      expect_success
      expect(json_data[:role]).to eq('admin')
    end

    it 'returns 422 when attempting to downgrade the last owner' do
      authenticated_patch "/api/v1/organizations/#{organization.id}/members/#{owner_membership.id}",
                          user: owner,
                          organization: organization,
                          params: { role: 'admin' }

      expect_unprocessable
    end
  end

  describe 'DELETE /api/v1/organizations/:organization_id/members/:id' do
    it 'removes a member as admin' do
      authenticated_delete "/api/v1/organizations/#{organization.id}/members/#{member_membership.id}",
                           user: admin,
                           organization: organization

      expect_no_content
      expect(OrganizationMembership.find_by(id: member_membership.id)).to be_nil
    end

    it 'cannot remove an owner unless also an owner' do
      authenticated_delete "/api/v1/organizations/#{organization.id}/members/#{owner_membership.id}",
                           user: admin,
                           organization: organization

      expect_forbidden
    end

    it 'returns 422 when attempting to remove the last owner' do
      authenticated_delete "/api/v1/organizations/#{organization.id}/members/#{owner_membership.id}",
                           user: owner,
                           organization: organization

      expect_unprocessable
      expect(OrganizationMembership.exists?(owner_membership.id)).to be true
    end
  end

  describe 'GET /api/v1/organizations/:organization_id/members/:id/stats' do
    before do
      # Create tool events for the member
      create(:tool_event,
             organization: organization,
             user: member,
             tool_name: 'claude_code',
             model: 'claude-3-opus',
             tokens_in: 100,
             tokens_out: 500,
             cost_usd: 0.05,
             occurred_at: Time.current)
      create(:tool_event,
             organization: organization,
             user: member,
             tool_name: 'cursor',
             model: 'gpt-4',
             tokens_in: 50,
             tokens_out: 200,
             cost_usd: 0.02,
             occurred_at: 1.day.ago)
    end

    it 'returns comprehensive member stats' do
      authenticated_get "/api/v1/organizations/#{organization.id}/members/#{member_membership.id}/stats",
                        user: admin,
                        organization: organization

      expect_success
      expect(json_response[:total_events]).to eq(2)
      expect(json_response[:total_cost]).to be_a(Numeric)
      expect(json_response[:tokens]).to have_key(:total_in)
      expect(json_response[:tokens]).to have_key(:total_out)
      expect(json_response[:tool_breakdown]).to be_an(Array)
      expect(json_response[:model_breakdown]).to be_an(Array)
      expect(json_response[:daily_activity]).to be_an(Array)
    end

    it 'includes token details in tool breakdown' do
      authenticated_get "/api/v1/organizations/#{organization.id}/members/#{member_membership.id}/stats",
                        user: admin,
                        organization: organization

      expect_success
      tool = json_response[:tool_breakdown].first
      expect(tool).to have_key(:tokens_in)
      expect(tool).to have_key(:tokens_out)
      expect(tool).to have_key(:tokens_total)
    end

    it 'allows member to view their own stats' do
      authenticated_get "/api/v1/organizations/#{organization.id}/members/#{member_membership.id}/stats",
                        user: member,
                        organization: organization

      expect_success
    end
  end

  describe 'GET /api/v1/organizations/:organization_id/members/:id/events' do
    before do
      3.times do |i|
        create(:tool_event,
               organization: organization,
               user: member,
               tool_name: 'claude_code',
               occurred_at: i.hours.ago)
      end
    end

    it 'returns paginated events for the member' do
      authenticated_get "/api/v1/organizations/#{organization.id}/members/#{member_membership.id}/events",
                        user: admin,
                        organization: organization

      expect_success
      expect(json_data.length).to eq(3)
      expect(json_response[:meta]).to have_key(:current_page)
      expect(json_response[:meta]).to have_key(:total_count)
    end

    it 'supports pagination parameters' do
      authenticated_get "/api/v1/organizations/#{organization.id}/members/#{member_membership.id}/events",
                        user: admin,
                        organization: organization,
                        params: { page: 1, per_page: 2 }

      expect_success
      expect(json_data.length).to eq(2)
      expect(json_response[:meta][:per_page]).to eq(2)
    end

    it 'allows member to view their own events' do
      authenticated_get "/api/v1/organizations/#{organization.id}/members/#{member_membership.id}/events",
                        user: member,
                        organization: organization

      expect_success
    end
  end
end

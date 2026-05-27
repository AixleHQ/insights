# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Api::V1::OrganizationMembers', type: :request do
  let(:owner) { create(:user) }
  let(:admin) { create(:user) }
  let(:member) { create(:user) }
  let(:organization) { create(:organization) }
  let!(:owner_membership) { create(:organization_membership, user: owner, organization: organization, role: 'owner') }
  let!(:admin_membership) { create(:organization_membership, user: admin, organization: organization, role: 'owner') }
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

    it 'includes last_active_at from latest organization tool event' do
      member.update!(last_login_at: 1.week.ago)
      event_time = Time.zone.parse("2024-06-01 12:00:00")
      create(:tool_event, organization: organization, user: member, occurred_at: event_time)

      authenticated_get "/api/v1/organizations/#{organization.id}/members",
                        user: member,
                        organization: organization

      expect_success
      member_data = json_data.find { |m| m[:user][:email] == member.email }
      expect(member_data[:last_active_at]).to be_present
      expect(Time.zone.parse(member_data[:last_active_at])).to be_within(1.second).of(event_time)
    end

    it 'returns 0 tokens for members with no events' do
      authenticated_get "/api/v1/organizations/#{organization.id}/members",
                        user: member,
                        organization: organization

      expect_success
      member_data = json_data.find { |m| m[:user][:email] == member.email }
      expect(member_data[:total_tokens]).to eq(0)
    end

    it 'includes total_events for each member' do
      create_list(:tool_event, 3, organization: organization, user: member)

      authenticated_get "/api/v1/organizations/#{organization.id}/members",
                        user: member,
                        organization: organization

      expect_success
      member_data = json_data.find { |m| m[:user][:email] == member.email }
      expect(member_data[:total_events]).to eq(3)
    end

    it 'includes total_cost for each member' do
      create(:tool_event, organization: organization, user: member, cost_usd: 0.5)
      create(:tool_event, organization: organization, user: member, cost_usd: 1.25)

      authenticated_get "/api/v1/organizations/#{organization.id}/members",
                        user: member,
                        organization: organization

      expect_success
      member_data = json_data.find { |m| m[:user][:email] == member.email }
      expect(member_data[:total_cost]).to be_within(0.001).of(1.75)
    end

    it 'returns 0 events and 0 cost for members with no events' do
      authenticated_get "/api/v1/organizations/#{organization.id}/members",
                        user: member,
                        organization: organization

      expect_success
      member_data = json_data.find { |m| m[:user][:email] == member.email }
      expect(member_data[:total_events]).to eq(0)
      expect(member_data[:total_cost]).to eq(0.0)
    end

    it 'includes cli_connected true when member has an active user_tool_account' do
      create(:user_tool_account, organization_membership: member_membership, is_active: true)

      authenticated_get "/api/v1/organizations/#{organization.id}/members",
                        user: member,
                        organization: organization

      expect_success
      member_data = json_data.find { |m| m[:user][:email] == member.email }
      expect(member_data[:cli_connected]).to eq(true)
    end

    it 'includes cli_connected false when member has no active user_tool_account' do
      create(:user_tool_account, organization_membership: member_membership, is_active: false)

      authenticated_get "/api/v1/organizations/#{organization.id}/members",
                        user: member,
                        organization: organization

      expect_success
      member_data = json_data.find { |m| m[:user][:email] == member.email }
      expect(member_data[:cli_connected]).to eq(false)
    end

    it 'includes cli_connected false when member has no user_tool_account' do
      authenticated_get "/api/v1/organizations/#{organization.id}/members",
                        user: member,
                        organization: organization

      expect_success
      member_data = json_data.find { |m| m[:user][:email] == member.email }
      expect(member_data[:cli_connected]).to eq(false)
    end

    it 'filters by role' do
      authenticated_get "/api/v1/organizations/#{organization.id}/members",
                        user: member,
                        organization: organization,
                        params: { role: 'owner' }

      expect_success
      expect(json_data.length).to eq(2)
      expect(json_data.map { |m| m[:role] }).to all(eq('owner'))
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

    it 'creates a new membership as owner' do
      authenticated_post "/api/v1/organizations/#{organization.id}/members",
                         user: owner,
                         organization: organization,
                         params: { user_id: new_user.id, role: 'member' }

      expect_created
      expect(json_data[:role]).to eq('member')
    end

    it 'returns 403 for non-owners' do
      authenticated_post "/api/v1/organizations/#{organization.id}/members",
                         user: member,
                         organization: organization,
                         params: { user_id: new_user.id, role: 'member' }

      expect_forbidden
    end
  end

  describe 'PATCH /api/v1/organizations/:organization_id/members/:id' do
    it 'updates member role as owner' do
      authenticated_patch "/api/v1/organizations/#{organization.id}/members/#{member_membership.id}",
                          user: owner,
                          organization: organization,
                          params: { role: 'viewer' }

      expect_success
      expect(json_data[:role]).to eq('viewer')
    end

    it 'returns 422 when role is admin' do
      authenticated_patch "/api/v1/organizations/#{organization.id}/members/#{member_membership.id}",
                          user: owner,
                          organization: organization,
                          params: { role: 'admin' }

      expect_unprocessable
    end

    it 'member cannot update another member role' do
      authenticated_patch "/api/v1/organizations/#{organization.id}/members/#{admin_membership.id}",
                          user: member,
                          organization: organization,
                          params: { role: 'member' }

      expect_forbidden
    end

    it 'allows owner to demote another owner' do
      other_owner = create(:user)
      other_owner_membership = create(:organization_membership, user: other_owner, organization: organization, role: 'owner')

      authenticated_patch "/api/v1/organizations/#{organization.id}/members/#{other_owner_membership.id}",
                          user: owner,
                          organization: organization,
                          params: { role: 'member' }

      expect_success
      expect(json_data[:role]).to eq('member')
    end

    it 'returns 422 when attempting to downgrade the last owner' do
      admin_membership.destroy

      authenticated_patch "/api/v1/organizations/#{organization.id}/members/#{owner_membership.id}",
                          user: owner,
                          organization: organization,
                          params: { role: 'member' }

      expect_unprocessable
    end
  end

  describe 'DELETE /api/v1/organizations/:organization_id/members/:id' do
    it 'removes a member as owner' do
      authenticated_delete "/api/v1/organizations/#{organization.id}/members/#{member_membership.id}",
                           user: owner,
                           organization: organization

      expect_no_content
      expect(OrganizationMembership.find_by(id: member_membership.id)).to be_nil
    end

    it 'member cannot remove an owner' do
      authenticated_delete "/api/v1/organizations/#{organization.id}/members/#{owner_membership.id}",
                           user: member,
                           organization: organization

      expect_forbidden
    end

    it 'returns 422 when attempting to remove the last owner' do
      admin_membership.destroy

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
                        user: owner,
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
                        user: owner,
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
                        user: owner,
                        organization: organization

      expect_success
      expect(json_data.length).to eq(3)
      expect(json_response[:meta]).to have_key(:current_page)
      expect(json_response[:meta]).to have_key(:total_count)
    end

    it 'supports pagination parameters' do
      authenticated_get "/api/v1/organizations/#{organization.id}/members/#{member_membership.id}/events",
                        user: owner,
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

  describe 'GET /api/v1/organizations/:organization_id/members/:id/dashboard_stats' do
    before do
      create(:tool_event,
             organization: organization,
             user: member,
             tool_name: 'claude_code',
             tokens_in: 100,
             tokens_out: 500,
             cost_usd: 0.05,
             occurred_at: 10.days.ago)
      create(:tool_event,
             organization: organization,
             user: member,
             tool_name: 'cursor',
             tokens_in: 50,
             tokens_out: 200,
             cost_usd: 0.02,
             occurred_at: 20.days.ago)
    end

    it 'returns dashboard stats with default period' do
      authenticated_get "/api/v1/organizations/#{organization.id}/members/#{member_membership.id}/dashboard_stats",
                        user: owner,
                        organization: organization

      expect_success
      expect(json_response[:total_events]).to be_a(Integer)
      expect(json_response[:total_cost_usd]).to be_a(Numeric)
      expect(json_response[:total_tokens_in]).to be_a(Integer)
      expect(json_response[:total_tokens_out]).to be_a(Integer)
      expect(json_response[:events_change_percent]).to be_a(Numeric)
      expect(json_response[:cost_change_percent]).to be_a(Numeric)
      expect(json_response[:tokens_change_percent]).to be_a(Numeric)
      expect(json_response[:tool_breakdown]).to be_an(Array)
    end

    it 'returns tool_breakdown with correct field names' do
      authenticated_get "/api/v1/organizations/#{organization.id}/members/#{member_membership.id}/dashboard_stats",
                        user: owner,
                        organization: organization

      expect_success
      tool = json_response[:tool_breakdown].first
      expect(tool).to have_key(:tool_name)
      expect(tool).to have_key(:event_count)
      expect(tool).to have_key(:cost_usd)
    end

    it 'filters by explicit period param' do
      authenticated_get "/api/v1/organizations/#{organization.id}/members/#{member_membership.id}/dashboard_stats",
                        user: owner,
                        organization: organization,
                        params: { period: '7d' }

      expect_success
      # Both events are older than 7 days, so current window should be 0
      expect(json_response[:total_events]).to eq(0)
    end

    it 'resolves membership by user.id in path' do
      authenticated_get "/api/v1/organizations/#{organization.id}/members/#{member.id}/dashboard_stats",
                        user: owner,
                        organization: organization

      expect_success
    end

    it 'allows member to view their own dashboard stats' do
      authenticated_get "/api/v1/organizations/#{organization.id}/members/#{member_membership.id}/dashboard_stats",
                        user: member,
                        organization: organization

      expect_success
    end

    it 'denies a member from viewing another member dashboard stats' do
      other_member = create(:user)
      create(:organization_membership, user: other_member, organization: organization, role: 'member')

      authenticated_get "/api/v1/organizations/#{organization.id}/members/#{member_membership.id}/dashboard_stats",
                        user: other_member,
                        organization: organization

      expect(response).to have_http_status(:forbidden)
    end
  end

  describe 'GET /api/v1/organizations/:organization_id/members/:id/stats/heatmap' do
    before do
      create(:tool_event,
             organization: organization,
             user: member,
             tool_name: 'claude_code',
             occurred_at: 10.days.ago)
      create(:tool_event,
             organization: organization,
             user: member,
             tool_name: 'cursor',
             occurred_at: 10.days.ago)
      create(:tool_event,
             organization: organization,
             user: member,
             tool_name: 'claude_code',
             occurred_at: 20.days.ago)
    end

    it 'returns heatmap data as array of date/count pairs' do
      authenticated_get "/api/v1/organizations/#{organization.id}/members/#{member_membership.id}/stats/heatmap",
                        user: owner,
                        organization: organization

      expect_success
      expect(json_response).to be_an(Array)
      entry = json_response.first
      expect(entry).to have_key(:date)
      expect(entry).to have_key(:count)
    end

    it 'groups events by date' do
      authenticated_get "/api/v1/organizations/#{organization.id}/members/#{member_membership.id}/stats/heatmap",
                        user: owner,
                        organization: organization

      expect_success
      # Two events on same day should sum to count 2
      ten_days_ago = json_response.find { |r| r[:count] == 2 }
      expect(ten_days_ago).not_to be_nil
    end

    it 'resolves membership by user.id in path' do
      authenticated_get "/api/v1/organizations/#{organization.id}/members/#{member.id}/stats/heatmap",
                        user: owner,
                        organization: organization

      expect_success
    end

    it 'allows member to view their own heatmap' do
      authenticated_get "/api/v1/organizations/#{organization.id}/members/#{member_membership.id}/stats/heatmap",
                        user: member,
                        organization: organization

      expect_success
    end

    it 'denies a member from viewing another member heatmap' do
      other_member = create(:user)
      create(:organization_membership, user: other_member, organization: organization, role: 'member')

      authenticated_get "/api/v1/organizations/#{organization.id}/members/#{member_membership.id}/stats/heatmap",
                        user: other_member,
                        organization: organization

      expect(response).to have_http_status(:forbidden)
    end
  end

  describe 'GET /api/v1/organizations/:organization_id/members/:id/prompt_insights' do
    before do
      create(:tool_event,
             organization: organization,
             user: member,
             tool_name: 'claude_code',
             event_type: 'chat',
             tokens_in: 300,
             tokens_out: 600,
             occurred_at: 10.days.ago)
      create(:tool_event,
             organization: organization,
             user: member,
             tool_name: 'cursor',
             event_type: 'edit',
             tokens_in: 150,
             tokens_out: 300,
             occurred_at: 15.days.ago)
      create(:tool_event,
             organization: organization,
             user: member,
             tool_name: 'claude_code',
             event_type: 'commit',
             tokens_in: 200,
             tokens_out: 400,
             occurred_at: 20.days.ago)
    end

    it 'returns prompt insights with correct shape' do
      authenticated_get "/api/v1/organizations/#{organization.id}/members/#{member_membership.id}/prompt_insights",
                        user: owner,
                        organization: organization

      expect_success
      expect(json_response[:score]).to be_a(Numeric)
      expect(json_response[:dimensions]).to include(:structure, :context, :specificity)
      expect(json_response[:dimensions][:structure]).to be_a(Numeric)
      expect(json_response[:callouts]).to be_an(Array)
      expect(json_response[:callouts].length).to eq(3)
      callout = json_response[:callouts].first
      expect(callout).to have_key(:type)
      expect(callout).to have_key(:label)
      expect(callout).to have_key(:text)
    end

    it 'scores are in 0–10 range' do
      authenticated_get "/api/v1/organizations/#{organization.id}/members/#{member_membership.id}/prompt_insights",
                        user: owner,
                        organization: organization

      expect_success
      expect(json_response[:score]).to be_between(0, 10)
      %i[structure context specificity].each do |dim|
        expect(json_response[:dimensions][dim]).to be_between(0, 10)
      end
    end

    it 'returns empty state when period has no events' do
      authenticated_get "/api/v1/organizations/#{organization.id}/members/#{member_membership.id}/prompt_insights",
                        user: owner,
                        organization: organization,
                        params: { period: '7d' }

      # All events are older than 7 days
      expect_success
      expect(json_response[:score]).to eq(0)
      expect(json_response[:dimensions]).to eq({ structure: 0, context: 0, specificity: 0 })
      expect(json_response[:callouts]).to eq([])
    end

    it 'allows member to view their own prompt insights' do
      authenticated_get "/api/v1/organizations/#{organization.id}/members/#{member_membership.id}/prompt_insights",
                        user: member,
                        organization: organization

      expect_success
    end

    it 'denies a member from viewing another member prompt insights' do
      other_member = create(:user)
      create(:organization_membership, user: other_member, organization: organization, role: 'member')

      authenticated_get "/api/v1/organizations/#{organization.id}/members/#{member_membership.id}/prompt_insights",
                        user: other_member,
                        organization: organization

      expect(response).to have_http_status(:forbidden)
    end

    it 'allows owner to view any member prompt insights' do
      authenticated_get "/api/v1/organizations/#{organization.id}/members/#{member_membership.id}/prompt_insights",
                        user: owner,
                        organization: organization

      expect_success
    end

    it 'returns empty payload for member with no events ever' do
      empty_member = create(:user)
      empty_membership = create(:organization_membership, user: empty_member, organization: organization, role: 'member')

      authenticated_get "/api/v1/organizations/#{organization.id}/members/#{empty_membership.id}/prompt_insights",
                        user: owner,
                        organization: organization

      expect_success
      expect(json_response[:score]).to eq(0)
      expect(json_response[:callouts]).to be_empty
    end
  end
end

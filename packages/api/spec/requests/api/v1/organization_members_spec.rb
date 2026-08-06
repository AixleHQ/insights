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
      create(:user_tool_account, organization_membership: member_membership, connection_state: 'active')

      authenticated_get "/api/v1/organizations/#{organization.id}/members",
                        user: member,
                        organization: organization

      expect_success
      member_data = json_data.find { |m| m[:user][:email] == member.email }
      expect(member_data[:cli_connected]).to eq(true)
    end

    it 'includes cli_connected false when member has no active user_tool_account' do
      create(:user_tool_account, organization_membership: member_membership, connection_state: 'inactive')

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

    it 'returns 403 when an owner attempts to downgrade the last owner' do
      # After admin_membership is removed, owner_membership is the sole owner.
      # Policy blocks the attempt because actor == subject (owner tries to change own role).
      # The model-level guard for this invariant is covered in organization_membership_spec.rb.
      admin_membership.destroy

      authenticated_patch "/api/v1/organizations/#{organization.id}/members/#{owner_membership.id}",
                          user: owner,
                          organization: organization,
                          params: { role: 'member' }

      expect_forbidden
    end
  end

  describe 'GET /api/v1/organizations/:organization_id/members/:id/removal_preview' do
    it 'returns sole-owner projects and new owner for an admin remove' do
      project = create(:project, organization: organization, name: 'Solo Project')
      create(:project_membership, :owner, user: member, project: project)

      authenticated_get "/api/v1/organizations/#{organization.id}/members/#{member_membership.id}/removal_preview",
                        user: owner,
                        organization: organization

      expect_success
      expect(json_data[:sole_owner_projects]).to contain_exactly(
        hash_including(id: project.id, name: 'Solo Project')
      )
      expect(json_data[:new_owner]).to include(id: owner.id, email: owner.email)
    end

    it 'allows a member to preview their own leave' do
      authenticated_get "/api/v1/organizations/#{organization.id}/members/#{member_membership.id}/removal_preview",
                        user: member,
                        organization: organization

      expect_success
      expect(json_data[:sole_owner_projects]).to eq([])
    end

    it 'forbids a member from previewing another member removal' do
      authenticated_get "/api/v1/organizations/#{organization.id}/members/#{owner_membership.id}/removal_preview",
                        user: member,
                        organization: organization

      expect_forbidden
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

    it 'creates a member.removed organization audit log' do
      expect do
        authenticated_delete "/api/v1/organizations/#{organization.id}/members/#{member_membership.id}",
                             user: owner,
                             organization: organization
      end.to change(OrganizationAuditLog, :count).by(1)

      log = OrganizationAuditLog.order(:created_at).last
      expect(log.action).to eq('member.removed')
      expect(log.tracked_changes.with_indifferent_access).to include(user_id: member.id, role: 'member')
    end

    it 'transfers sole-owner projects to the removing owner and clears project memberships' do
      project = create(:project, organization: organization)
      create(:project_membership, :owner, user: member, project: project)

      authenticated_delete "/api/v1/organizations/#{organization.id}/members/#{member_membership.id}",
                           user: owner,
                           organization: organization

      expect_no_content
      expect(ProjectMembership.find_by(user_id: member.id, project_id: project.id)).to be_nil
      expect(ProjectMembership.find_by(user_id: owner.id, project_id: project.id)).to have_attributes(role: 'owner')
    end

    it 'allows a member to leave and cleans up project memberships' do
      project = create(:project, organization: organization)
      create(:project_membership, :owner, user: member, project: project)

      authenticated_delete "/api/v1/organizations/#{organization.id}/members/#{member_membership.id}",
                           user: member,
                           organization: organization

      expect_no_content
      expect(OrganizationMembership.find_by(id: member_membership.id)).to be_nil
      expect(ProjectMembership.find_by(user_id: owner.id, project_id: project.id)).to have_attributes(role: 'owner')
    end

    it 'allows an owner to leave when another owner exists' do
      authenticated_delete "/api/v1/organizations/#{organization.id}/members/#{owner_membership.id}",
                           user: owner,
                           organization: organization

      expect_no_content
      expect(OrganizationMembership.find_by(id: owner_membership.id)).to be_nil
    end

    it 'transfers sole-owner projects to a global admin actor who is an org member' do
      global_admin = create(:user, :global_admin)
      create(:organization_membership, user: global_admin, organization: organization, role: 'member')
      project = create(:project, organization: organization, name: 'Admin Transfer Project')
      create(:project_membership, :owner, user: member, project: project)

      authenticated_delete "/api/v1/organizations/#{organization.id}/members/#{member_membership.id}",
                           user: global_admin,
                           organization: organization

      expect_no_content
      expect(ProjectMembership.find_by(user_id: member.id, project_id: project.id)).to be_nil
      expect(ProjectMembership.find_by(user_id: global_admin.id, project_id: project.id)).to have_attributes(role: 'owner')
    end

    it 'returns 422 when a global admin tries to remove the last org owner' do
      global_admin = create(:user, :global_admin)
      create(:organization_membership, user: global_admin, organization: organization, role: 'member')
      admin_membership.destroy!
      member_membership.destroy!

      authenticated_delete "/api/v1/organizations/#{organization.id}/members/#{owner_membership.id}",
                           user: global_admin,
                           organization: organization

      expect_unprocessable
      expect(OrganizationMembership.exists?(owner_membership.id)).to be true
    end

    it 'returns 422 when the removal service cannot resolve a transfer target' do
      project = create(:project, organization: organization)
      create(:project_membership, :owner, user: member, project: project)

      allow(OrganizationMembershipRemovalService).to receive(:call).and_raise(
        OrganizationMembershipRemovalService::Error,
        'Cannot transfer sole-owner projects: no eligible new owner'
      )

      authenticated_delete "/api/v1/organizations/#{organization.id}/members/#{member_membership.id}",
                           user: owner,
                           organization: organization

      expect_unprocessable
      expect(json_errors).to include(hash_including(field: 'base', message: /no eligible new owner/))
    end

    it 'member cannot remove an owner' do
      authenticated_delete "/api/v1/organizations/#{organization.id}/members/#{owner_membership.id}",
                           user: member,
                           organization: organization

      expect_forbidden
    end

    it 'returns 403 when an owner attempts to remove themselves as the last owner' do
      # After admin_membership is removed, owner is the sole owner.
      # Policy blocks self-removal with 403.
      # The model-level guard for this invariant is covered in organization_membership_spec.rb.
      admin_membership.destroy

      authenticated_delete "/api/v1/organizations/#{organization.id}/members/#{owner_membership.id}",
                           user: owner,
                           organization: organization

      expect_forbidden
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

    context 'with a member who has events older than 30 days' do
      before do
        create(:tool_event,
               organization: organization,
               user: member,
               tool_name: 'claude_code',
               tokens_in: 10,
               tokens_out: 10,
               cost_usd: 1.0,
               occurred_at: 90.days.ago)
      end

      it 'excludes events outside the default 30-day window' do
        authenticated_get "/api/v1/organizations/#{organization.id}/members/#{member_membership.id}/stats",
                          user: owner,
                          organization: organization

        expect_success
        expect(json_response[:total_events]).to eq(2)
      end

      it 'includes the older window when days is widened' do
        authenticated_get "/api/v1/organizations/#{organization.id}/members/#{member_membership.id}/stats?days=365",
                          user: owner,
                          organization: organization

        expect_success
        expect(json_response[:total_events]).to eq(3)
      end

      it 'aggregates the full history when all_time is true' do
        authenticated_get "/api/v1/organizations/#{organization.id}/members/#{member_membership.id}/stats?all_time=true",
                          user: owner,
                          organization: organization

        expect_success
        expect(json_response[:total_events]).to eq(3)
        expect(json_response[:daily_activity].sum { |d| d[:count] }).to eq(3)
      end
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

    it 'scopes stats to a project when project_id is given' do
      project = create(:project, organization: organization)
      create(:tool_event,
             organization: organization,
             user: member,
             project: project,
             tool_name: 'claude_code',
             occurred_at: 5.days.ago)

      authenticated_get "/api/v1/organizations/#{organization.id}/members/#{member_membership.id}/dashboard_stats",
                        user: owner,
                        organization: organization,
                        params: { project_id: project.id }

      expect_success
      # Only the project-scoped event falls in the default 30d window.
      expect(json_response[:total_events]).to eq(1)
    end

    it 'scopes stats to unattributed events when project_id=none' do
      project = create(:project, organization: organization)
      create(:tool_event,
             organization: organization,
             user: member,
             project: project,
             tool_name: 'claude_code',
             occurred_at: 5.days.ago)

      authenticated_get "/api/v1/organizations/#{organization.id}/members/#{member_membership.id}/dashboard_stats",
                        user: owner,
                        organization: organization,
                        params: { project_id: 'none' }

      expect_success
      # The two before-block events have no project; the project-scoped one is excluded.
      expect(json_response[:total_events]).to eq(2)
    end

    it 'returns 404 for a project_id from another org' do
      other_org = create(:organization)
      other_project = create(:project, organization: other_org)

      authenticated_get "/api/v1/organizations/#{organization.id}/members/#{member_membership.id}/dashboard_stats",
                        user: owner,
                        organization: organization,
                        params: { project_id: other_project.id }

      expect(response).to have_http_status(:not_found)
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

    it 'scopes the heatmap to a project when project_id is given' do
      project = create(:project, organization: organization)
      create(:tool_event,
             organization: organization,
             user: member,
             project: project,
             tool_name: 'claude_code',
             occurred_at: 3.days.ago)

      authenticated_get "/api/v1/organizations/#{organization.id}/members/#{member_membership.id}/stats/heatmap",
                        user: owner,
                        organization: organization,
                        params: { project_id: project.id }

      expect_success
      total = json_response.sum { |r| r[:count] }
      expect(total).to eq(1)
    end

    it 'scopes the heatmap to unattributed events when project_id is "none"' do
      project = create(:project, organization: organization)
      create(:tool_event,
             organization: organization,
             user: member,
             project: project,
             tool_name: 'claude_code',
             occurred_at: 3.days.ago)

      authenticated_get "/api/v1/organizations/#{organization.id}/members/#{member_membership.id}/stats/heatmap",
                        user: owner,
                        organization: organization,
                        params: { project_id: 'none' }

      expect_success
      # The three before-block events have no project; the project-scoped one is excluded.
      total = json_response.sum { |r| r[:count] }
      expect(total).to eq(3)
    end

    it 'returns 404 for a project_id from another org' do
      other_org = create(:organization)
      other_project = create(:project, organization: other_org)

      authenticated_get "/api/v1/organizations/#{organization.id}/members/#{member_membership.id}/stats/heatmap",
                        user: owner,
                        organization: organization,
                        params: { project_id: other_project.id }

      expect(response).to have_http_status(:not_found)
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

    it 'scopes insights to a project when project_id is given' do
      project = create(:project, organization: organization)
      create(:tool_event,
             organization: organization,
             user: member,
             project: project,
             tool_name: 'claude_code',
             event_type: 'chat',
             tokens_in: 5000,
             tokens_out: 100,
             occurred_at: 5.days.ago)

      authenticated_get "/api/v1/organizations/#{organization.id}/members/#{member_membership.id}/prompt_insights",
                        user: owner,
                        organization: organization,
                        params: { project_id: project.id }

      # Unattributed before-block events are excluded; the project event yields insights.
      expect_success
      expect(json_response[:callouts].length).to eq(3)
      expect(json_response[:score]).to be > 0
    end

    it 'returns empty insights when project_id has no matching events' do
      project = create(:project, organization: organization)

      authenticated_get "/api/v1/organizations/#{organization.id}/members/#{member_membership.id}/prompt_insights",
                        user: owner,
                        organization: organization,
                        params: { project_id: project.id }

      # Before-block events are unattributed, so this project scope is empty.
      expect_success
      expect(json_response[:score]).to eq(0)
      expect(json_response[:callouts]).to eq([])
    end

    it 'scopes insights to unattributed events when project_id=none' do
      project = create(:project, organization: organization)
      create(:tool_event,
             organization: organization,
             user: member,
             project: project,
             tool_name: 'claude_code',
             event_type: 'chat',
             tokens_in: 5000,
             tokens_out: 100,
             occurred_at: 5.days.ago)

      authenticated_get "/api/v1/organizations/#{organization.id}/members/#{member_membership.id}/prompt_insights",
                        user: owner,
                        organization: organization,
                        params: { project_id: 'none' }

      # The project-scoped event is excluded, so the score reflects only the
      # three unattributed before-block events (non-empty callouts).
      expect_success
      expect(json_response[:callouts].length).to eq(3)
    end

    it 'returns 404 for a project_id from another org' do
      other_org = create(:organization)
      other_project = create(:project, organization: other_org)

      authenticated_get "/api/v1/organizations/#{organization.id}/members/#{member_membership.id}/prompt_insights",
                        user: owner,
                        organization: organization,
                        params: { project_id: other_project.id }

      expect(response).to have_http_status(:not_found)
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

# frozen_string_literal: true

require "rails_helper"

RSpec.describe "Api::V1::ProjectMembers", type: :request do
  let(:org_owner) { create(:user) }
  let(:project_owner_user) { create(:user) }
  let(:member) { create(:user) }
  let(:organization) { create(:organization) }
  let(:project) { create(:project, organization: organization, owner: nil) }

  let!(:org_owner_org_membership) { create(:organization_membership, user: org_owner, organization: organization, role: "owner") }
  let!(:project_owner_org_membership) { create(:organization_membership, user: project_owner_user, organization: organization) }
  let!(:member_org_membership) { create(:organization_membership, user: member, organization: organization) }

  let!(:project_owner_membership) { create(:project_membership, user: project_owner_user, project: project, role: "owner") }
  let!(:project_member_membership) { create(:project_membership, user: member, project: project, role: "member") }

  describe "GET /api/v1/projects/:project_id/members" do
    it "returns all project members for project row-owner" do
      authenticated_get "/api/v1/projects/#{project.id}/members", user: project_owner_user

      expect_success
      expect(json_data.length).to eq(2)
    end

    it "returns members for org owner (no membership row required)" do
      authenticated_get "/api/v1/projects/#{project.id}/members", user: org_owner

      expect_success
    end

    it "includes flat user fields" do
      authenticated_get "/api/v1/projects/#{project.id}/members", user: project_owner_user

      expect_success
      record = json_data.find { |m| m[:userId] == member.id }
      expect(record).to be_present
      expect(record[:email]).to eq(member.email)
      expect(record[:name]).to eq(member.name)
      expect(record[:joinedAt]).to be_present
    end

    it "includes usage aggregates scoped to the project" do
      create(:tool_event,
             organization: organization,
             project: project,
             user: member,
             tokens_in: 100,
             tokens_out: 200,
             cost_usd: 0.5,
             occurred_at: 1.day.ago)

      authenticated_get "/api/v1/projects/#{project.id}/members", user: project_owner_user

      expect_success
      record = json_data.find { |m| m[:userId] == member.id }
      expect(record[:total_tokens]).to eq(300)
      expect(record[:total_events]).to eq(1)
      expect(record[:total_cost]).to be_within(0.001).of(0.5)
      expect(record[:last_active_at]).to be_present
    end

    it "does not include tool events from other projects in list aggregates" do
      other_project = create(:project, organization: organization)
      create(:tool_event, organization: organization, project: project, user: member, tokens_in: 10, tokens_out: 10)
      create(:tool_event, organization: organization, project: other_project, user: member, tokens_in: 1_000, tokens_out: 1_000)

      authenticated_get "/api/v1/projects/#{project.id}/members", user: project_owner_user

      expect_success
      record = json_data.find { |m| m[:userId] == member.id }
      expect(record[:total_tokens]).to eq(20)
    end

    it "returns zero aggregates when the member has no project events" do
      authenticated_get "/api/v1/projects/#{project.id}/members", user: project_owner_user

      expect_success
      record = json_data.find { |m| m[:userId] == member.id }
      expect(record[:total_tokens]).to eq(0)
      expect(record[:total_events]).to eq(0)
      expect(record[:total_cost]).to eq(0.0)
      expect(record[:last_active_at]).to be_nil
    end

    it "includes cli_connected true when member has an active user_tool_account in the org" do
      create(:user_tool_account, organization_membership: member_org_membership, connection_state: 'active')

      authenticated_get "/api/v1/projects/#{project.id}/members", user: project_owner_user

      expect_success
      record = json_data.find { |m| m[:userId] == member.id }
      expect(record[:cli_connected]).to eq(true)
    end

    it "includes cli_connected false when member has only inactive user_tool_accounts" do
      create(:user_tool_account, organization_membership: member_org_membership, connection_state: 'inactive')

      authenticated_get "/api/v1/projects/#{project.id}/members", user: project_owner_user

      expect_success
      record = json_data.find { |m| m[:userId] == member.id }
      expect(record[:cli_connected]).to eq(false)
    end

    it "includes cli_connected false when member has no user_tool_account" do
      authenticated_get "/api/v1/projects/#{project.id}/members", user: project_owner_user

      expect_success
      record = json_data.find { |m| m[:userId] == member.id }
      expect(record[:cli_connected]).to eq(false)
    end

    it "filters by role" do
      authenticated_get "/api/v1/projects/#{project.id}/members", user: project_owner_user, params: { role: "owner" }

      expect_success
      expect(json_data.length).to eq(1)
      expect(json_data.first[:role]).to eq("owner")
    end

    it "returns 200 for regular project members (policy fix regression)" do
      authenticated_get "/api/v1/projects/#{project.id}/members", user: member

      expect_success
      expect(json_data.length).to eq(2)
    end

    it "returns 403 for outsiders" do
      outsider = create(:user)
      authenticated_get "/api/v1/projects/#{project.id}/members", user: outsider

      expect_forbidden
    end
  end

  describe "GET /api/v1/projects/:project_id/members/:id" do
    it "returns a single membership for project row-owner" do
      authenticated_get "/api/v1/projects/#{project.id}/members/#{project_member_membership.id}",
                          user: project_owner_user

      expect_success
      expect(json_data[:id]).to eq(project_member_membership.id)
    end

    it "returns the membership when :id is the user uuid" do
      authenticated_get "/api/v1/projects/#{project.id}/members/#{member.id}",
                          user: project_owner_user

      expect_success
      expect(json_data[:id]).to eq(project_member_membership.id)
    end

    it "returns 200 for regular project members (policy fix regression)" do
      authenticated_get "/api/v1/projects/#{project.id}/members/#{project_member_membership.id}",
                          user: member

      expect_success
    end
  end

  describe "GET /api/v1/projects/:project_id/members/:id/breakdown" do
    let(:other_project) { create(:project, organization: organization) }

    before do
      create(:tool_event,
             organization: organization,
             project: project,
             user: member,
             tool_name: "claude_code",
             model: "claude-3-opus",
             tokens_in: 100,
             tokens_out: 500,
             cost_usd: 0.05,
             occurred_at: Time.current)
      create(:tool_event,
             organization: organization,
             project: other_project,
             user: member,
             tool_name: "cursor",
             model: "gpt-4",
             tokens_in: 50,
             tokens_out: 200,
             cost_usd: 0.02,
             occurred_at: 1.day.ago)
    end

    it "returns project-scoped stats and breakdowns" do
      authenticated_get "/api/v1/projects/#{project.id}/members/#{project_member_membership.id}/breakdown",
                          user: org_owner

      expect_success
      expect(json_response[:total_events]).to eq(1)
      expect(json_response[:total_cost]).to be_a(Numeric)
      expect(json_response[:tokens]).to have_key(:total_in)
      expect(json_response[:tokens]).to have_key(:total_out)
      expect(json_response[:tool_breakdown].length).to eq(1)
      expect(json_response[:tool_breakdown].first[:tool]).to eq("claude_code")
      expect(json_response[:model_breakdown]).to be_an(Array)
      expect(json_response[:daily_activity]).to be_an(Array)
    end

    it "resolves stats when path id is the member user uuid" do
      authenticated_get "/api/v1/projects/#{project.id}/members/#{member.id}/breakdown",
                          user: org_owner

      expect_success
      expect(json_response[:total_events]).to eq(1)
    end

    it "returns 403 for a regular project member" do
      authenticated_get "/api/v1/projects/#{project.id}/members/#{project_member_membership.id}/breakdown",
                          user: member

      expect_forbidden
    end
  end

  describe "POST /api/v1/projects/:project_id/members" do
    let(:new_user) { create(:user) }
    let!(:new_user_org_membership) { create(:organization_membership, user: new_user, organization: organization) }

    it "adds a member as org owner" do
      authenticated_post "/api/v1/projects/#{project.id}/members",
                         user: org_owner,
                         params: { user_id: new_user.id, role: "member" }

      expect_created
      expect(json_data[:role]).to eq("member")
    end

    it "sets created_by to the acting org owner" do
      authenticated_post "/api/v1/projects/#{project.id}/members",
                         user: org_owner,
                         params: { user_id: new_user.id, role: "member" }

      expect_created
      membership = ProjectMembership.find(json_data[:id])
      expect(membership.created_by).to eq(org_owner)
    end

    it "exposes createdById in the response" do
      authenticated_post "/api/v1/projects/#{project.id}/members",
                         user: org_owner,
                         params: { user_id: new_user.id, role: "member" }

      expect_created
      expect(json_data[:createdById]).to eq(org_owner.id)
    end

    it "creates a member.invited audit log" do
      expect do
        authenticated_post "/api/v1/projects/#{project.id}/members",
                           user: org_owner,
                           params: { user_id: new_user.id, role: "member" }
      end.to change(ProjectAuditLog, :count).by(1)

      log = ProjectAuditLog.last
      expect(log.action).to eq("member.invited")
      expect(log.actor).to eq(org_owner)
      expect(log.tracked_changes["user_id"]).to eq(new_user.id)
    end

    it "rejects adding a non-org-member (org ceiling)" do
      outsider = create(:user)
      authenticated_post "/api/v1/projects/#{project.id}/members",
                         user: org_owner,
                         params: { user_id: outsider.id, role: "member" }

      expect_unprocessable
    end

    it "rejects admin role (no longer valid)" do
      authenticated_post "/api/v1/projects/#{project.id}/members",
                         user: org_owner,
                         params: { user_id: new_user.id, role: "admin" }

      expect_unprocessable
    end

    it "returns 403 for project row-owner who is not org owner" do
      authenticated_post "/api/v1/projects/#{project.id}/members",
                         user: project_owner_user,
                         params: { user_id: new_user.id, role: "member" }

      expect_forbidden
    end
  end

  describe "PATCH /api/v1/projects/:project_id/members/:id" do
    it "updates member role as org owner" do
      u = create(:user)
      create(:organization_membership, user: u, organization: organization)
      m = create(:project_membership, user: u, project: project, role: "member")

      authenticated_patch "/api/v1/projects/#{project.id}/members/#{m.id}",
                          user: org_owner,
                          params: { role: "viewer" }

      expect_success
      expect(json_data[:role]).to eq("viewer")
    end

    it "creates a member.role_changed audit log" do
      u = create(:user)
      create(:organization_membership, user: u, organization: organization)
      m = create(:project_membership, user: u, project: project, role: "member")

      expect do
        authenticated_patch "/api/v1/projects/#{project.id}/members/#{m.id}",
                            user: org_owner,
                            params: { role: "viewer" }
      end.to change(ProjectAuditLog, :count).by(1)

      log = ProjectAuditLog.last
      expect(log.action).to eq("member.role_changed")
      expect(log.actor).to eq(org_owner)
      expect(log.tracked_changes["before"]).to eq("member")
      expect(log.tracked_changes["after"]).to eq("viewer")
    end

    it "returns 422 when attempting to downgrade the last owner" do
      authenticated_patch "/api/v1/projects/#{project.id}/members/#{project_owner_membership.id}",
                          user: org_owner,
                          params: { role: "member" }

      expect_unprocessable
    end

    it "allows org owner to demote a row-owner when multiple owners exist" do
      second_owner_user = create(:user)
      create(:organization_membership, user: second_owner_user, organization: organization)
      second_owner_membership = create(:project_membership, user: second_owner_user, project: project, role: "owner")

      authenticated_patch "/api/v1/projects/#{project.id}/members/#{second_owner_membership.id}",
                          user: org_owner,
                          params: { role: "member" }

      expect_success
      expect(json_data[:role]).to eq("member")
    end

    it "returns 403 for project row-owner who is not org owner" do
      authenticated_patch "/api/v1/projects/#{project.id}/members/#{project_member_membership.id}",
                          user: project_owner_user,
                          params: { role: "viewer" }

      expect_forbidden
    end
  end

  describe "GET /api/v1/projects/:project_id/members/stats" do
    it "returns 200 for org owner" do
      authenticated_get "/api/v1/projects/#{project.id}/members/stats", user: org_owner

      expect_success
      expect(json_data).to be_an(Array)
    end

    it "returns 200 for project row-owner" do
      authenticated_get "/api/v1/projects/#{project.id}/members/stats", user: project_owner_user

      expect_success
      expect(json_data).to be_an(Array)
    end

    it "returns 403 for project member role" do
      authenticated_get "/api/v1/projects/#{project.id}/members/stats", user: member

      expect_forbidden
    end

    it "includes all members even those with zero events in the period" do
      authenticated_get "/api/v1/projects/#{project.id}/members/stats", user: org_owner

      expect_success
      user_ids = json_data.map { |r| r[:userId] }
      expect(user_ids).to include(member.id)
      zero_row = json_data.find { |r| r[:userId] == member.id }
      expect(zero_row[:eventCount]).to eq(0)
    end

    it "returns the most-used tool as primaryTool" do
      create(:tool_event, user: project_owner_user, project: project,
             organization: organization, tool_name: "claude_code", occurred_at: 1.day.ago)
      create(:tool_event, user: project_owner_user, project: project,
             organization: organization, tool_name: "claude_code", occurred_at: 2.days.ago)
      create(:tool_event, user: project_owner_user, project: project,
             organization: organization, tool_name: "cursor", occurred_at: 3.days.ago)

      authenticated_get "/api/v1/projects/#{project.id}/members/stats", user: org_owner

      expect_success
      row = json_data.find { |r| r[:userId] == project_owner_user.id }
      expect(row[:primaryTool]).to eq("claude_code")
      expect(row[:eventCount]).to eq(3)
    end

    it "does not include tool events from other projects in stats aggregates" do
      other_project = create(:project, organization: organization)
      create(:tool_event, user: member, project: project,
             organization: organization, tool_name: "cursor", occurred_at: 1.day.ago)
      create(:tool_event, user: member, project: other_project,
             organization: organization, tool_name: "cursor", occurred_at: 1.hour.ago)

      authenticated_get "/api/v1/projects/#{project.id}/members/stats", user: org_owner

      expect_success
      row = json_data.find { |r| r[:userId] == member.id }
      expect(row[:eventCount]).to eq(1)
    end
  end

  describe "DELETE /api/v1/projects/:project_id/members/:id" do
    it "removes a member as org owner" do
      removable_user = create(:user)
      create(:organization_membership, user: removable_user, organization: organization)
      removable = create(:project_membership, user: removable_user, project: project, role: "member")

      authenticated_delete "/api/v1/projects/#{project.id}/members/#{removable.id}",
                           user: org_owner

      expect_no_content
      expect(ProjectMembership.find_by(id: removable.id)).to be_nil
    end

    it "creates a member.removed audit log" do
      removable_user = create(:user)
      create(:organization_membership, user: removable_user, organization: organization)
      removable = create(:project_membership, user: removable_user, project: project, role: "member")

      expect do
        authenticated_delete "/api/v1/projects/#{project.id}/members/#{removable.id}",
                             user: org_owner
      end.to change(ProjectAuditLog, :count).by(1)

      log = ProjectAuditLog.last
      expect(log.action).to eq("member.removed")
      expect(log.actor).to eq(org_owner)
      expect(log.tracked_changes["user_id"]).to eq(removable_user.id)
    end

    it "returns 422 when attempting to remove the last owner" do
      authenticated_delete "/api/v1/projects/#{project.id}/members/#{project_owner_membership.id}",
                           user: org_owner

      expect_unprocessable
      expect(ProjectMembership.exists?(project_owner_membership.id)).to be true
    end

    it "returns 403 for project row-owner who is not org owner" do
      other = create(:user)
      create(:organization_membership, user: other, organization: organization)
      other_membership = create(:project_membership, user: other, project: project, role: "member")

      authenticated_delete "/api/v1/projects/#{project.id}/members/#{other_membership.id}",
                           user: project_owner_user

      expect_forbidden
    end
  end
end

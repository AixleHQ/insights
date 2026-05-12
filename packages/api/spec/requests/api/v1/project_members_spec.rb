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

    it "filters by role" do
      authenticated_get "/api/v1/projects/#{project.id}/members", user: project_owner_user, params: { role: "owner" }

      expect_success
      expect(json_data.length).to eq(1)
      expect(json_data.first[:role]).to eq("owner")
    end

    it "returns 403 for regular project members" do
      authenticated_get "/api/v1/projects/#{project.id}/members", user: member

      expect_forbidden
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

    it "returns 403 for regular members" do
      authenticated_get "/api/v1/projects/#{project.id}/members/#{project_member_membership.id}",
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

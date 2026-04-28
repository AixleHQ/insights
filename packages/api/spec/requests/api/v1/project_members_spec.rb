# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Api::V1::ProjectMembers', type: :request do
  let(:owner) { create(:user) }
  let(:admin) { create(:user) }
  let(:member) { create(:user) }
  let(:organization) { create(:organization) }
  let(:project) { create(:project, organization: organization, owner: nil) }
  let!(:owner_membership) { create(:organization_membership, user: owner, organization: organization) }
  let!(:admin_membership) { create(:organization_membership, user: admin, organization: organization) }
  let!(:member_membership) { create(:organization_membership, user: member, organization: organization) }
  let!(:project_owner_membership) { create(:project_membership, user: owner, project: project, role: 'owner') }
  let!(:project_admin_membership) { create(:project_membership, user: admin, project: project, role: 'admin') }
  let!(:project_member_membership) { create(:project_membership, user: member, project: project, role: 'member') }

  describe 'GET /api/v1/projects/:project_id/members' do
    it 'returns all project members' do
      authenticated_get "/api/v1/projects/#{project.id}/members", user: member

      expect_success
      expect(json_data.length).to eq(3)
    end

    it 'includes flat user fields (userId, email, name, avatarUrl, joinedAt)' do
      authenticated_get "/api/v1/projects/#{project.id}/members", user: member

      expect_success
      record = json_data.find { |m| m[:userId] == member.id }
      expect(record).to be_present
      expect(record[:email]).to eq(member.email)
      expect(record[:name]).to eq(member.name)
      expect(record[:joinedAt]).to be_present
    end

    it 'filters by role' do
      authenticated_get "/api/v1/projects/#{project.id}/members", user: member, params: { role: 'owner' }

      expect_success
      expect(json_data.length).to eq(1)
      expect(json_data.first[:role]).to eq('owner')
    end

    it 'returns 403 for non-members' do
      outsider = create(:user)
      authenticated_get "/api/v1/projects/#{project.id}/members", user: outsider

      expect_forbidden
    end
  end

  describe 'POST /api/v1/projects/:project_id/members' do
    let(:new_user) { create(:user) }
    let!(:new_user_org_membership) { create(:organization_membership, user: new_user, organization: organization) }

    it 'adds a member as project admin' do
      authenticated_post "/api/v1/projects/#{project.id}/members",
                         user: admin,
                         params: { user_id: new_user.id, role: 'member' }

      expect_created
      expect(json_data[:role]).to eq('member')
    end

    it 'creates a member.invited audit log' do
      expect {
        authenticated_post "/api/v1/projects/#{project.id}/members",
                           user: admin,
                           params: { user_id: new_user.id, role: 'member' }
      }.to change(ProjectAuditLog, :count).by(1)

      log = ProjectAuditLog.last
      expect(log.action).to eq('member.invited')
      expect(log.actor).to eq(admin)
      expect(log.tracked_changes['user_id']).to eq(new_user.id)
      expect(log.tracked_changes['role']).to eq('member')
    end

    it 'returns 403 for non-admins' do
      authenticated_post "/api/v1/projects/#{project.id}/members",
                         user: member,
                         params: { user_id: new_user.id, role: 'member' }

      expect_forbidden
    end
  end

  describe 'PATCH /api/v1/projects/:project_id/members/:id' do
    it 'updates member role as project admin' do
      authenticated_patch "/api/v1/projects/#{project.id}/members/#{project_member_membership.id}",
                          user: admin,
                          params: { role: 'viewer' }

      expect_success
      expect(json_data[:role]).to eq('viewer')
    end

    it 'creates a member.role_changed audit log' do
      expect {
        authenticated_patch "/api/v1/projects/#{project.id}/members/#{project_member_membership.id}",
                            user: admin,
                            params: { role: 'viewer' }
      }.to change(ProjectAuditLog, :count).by(1)

      log = ProjectAuditLog.last
      expect(log.action).to eq('member.role_changed')
      expect(log.actor).to eq(admin)
      expect(log.tracked_changes['before']).to eq('member')
      expect(log.tracked_changes['after']).to eq('viewer')
    end

    it 'cannot demote an owner unless also an owner' do
      authenticated_patch "/api/v1/projects/#{project.id}/members/#{project_owner_membership.id}",
                          user: admin,
                          params: { role: 'admin' }

      expect_forbidden
    end

    it 'returns 422 when attempting to downgrade the last owner' do
      authenticated_patch "/api/v1/projects/#{project.id}/members/#{project_owner_membership.id}",
                          user: owner,
                          params: { role: 'admin' }

      expect_unprocessable
    end

    it 'allows owner to demote another owner when multiple owners exist' do
      second_owner = create(:user)
      create(:organization_membership, user: second_owner, organization: organization)
      second_owner_membership = create(:project_membership, user: second_owner, project: project, role: 'owner')

      authenticated_patch "/api/v1/projects/#{project.id}/members/#{second_owner_membership.id}",
                          user: owner,
                          params: { role: 'admin' }

      expect_success
      expect(json_data[:role]).to eq('admin')
    end
  end

  describe 'DELETE /api/v1/projects/:project_id/members/:id' do
    it 'removes a member as project admin' do
      authenticated_delete "/api/v1/projects/#{project.id}/members/#{project_member_membership.id}",
                           user: admin

      expect_no_content
      expect(ProjectMembership.find_by(id: project_member_membership.id)).to be_nil
    end

    it 'creates a member.removed audit log' do
      expect {
        authenticated_delete "/api/v1/projects/#{project.id}/members/#{project_member_membership.id}",
                             user: admin
      }.to change(ProjectAuditLog, :count).by(1)

      log = ProjectAuditLog.last
      expect(log.action).to eq('member.removed')
      expect(log.actor).to eq(admin)
      expect(log.tracked_changes['user_id']).to eq(member.id)
      expect(log.tracked_changes['role']).to eq('member')
    end

    it 'cannot remove an owner unless also an owner' do
      authenticated_delete "/api/v1/projects/#{project.id}/members/#{project_owner_membership.id}",
                           user: admin

      expect_forbidden
    end

    it 'returns 422 when attempting to remove the last owner' do
      authenticated_delete "/api/v1/projects/#{project.id}/members/#{project_owner_membership.id}",
                           user: owner

      expect_unprocessable
      expect(ProjectMembership.exists?(project_owner_membership.id)).to be true
    end
  end
end

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

    # TODO: Fix role filtering - params not being passed correctly in test
    xit 'filters by role' do
      headers = auth_headers_for(member)
      get "/api/v1/projects/#{project.id}/members", params: { role: 'owner' }, headers: headers

      expect_success
      expect(json_data.length).to eq(1)
      expect(json_data.first[:role]).to eq('owner')
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
  end

  describe 'DELETE /api/v1/projects/:project_id/members/:id' do
    it 'removes a member as project admin' do
      authenticated_delete "/api/v1/projects/#{project.id}/members/#{project_member_membership.id}",
                           user: admin

      expect_no_content
      expect(ProjectMembership.find_by(id: project_member_membership.id)).to be_nil
    end
  end
end

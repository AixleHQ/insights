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
    it 'returns the membership' do
      authenticated_get "/api/v1/organizations/#{organization.id}/members/#{member_membership.id}",
                        user: member,
                        organization: organization

      expect_success
      expect(json_data[:id]).to eq(member_membership.id)
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
  end
end

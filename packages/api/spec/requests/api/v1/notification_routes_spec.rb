# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Api::V1::NotificationRoutes', type: :request do
  let(:owner)        { create(:user) }
  let(:member)       { create(:user) }
  let(:organization) { create(:organization) }
  let(:other_org)    { create(:organization) }

  let!(:owner_membership)  { create(:organization_membership, user: owner, organization: organization, role: 'owner') }
  let!(:member_membership) { create(:organization_membership, user: member, organization: organization, role: 'member') }

  let!(:route) do
    create(:notification_route, organization: organization,
           notification_type: 'cost_alert', recipient_type: 'role', recipient_role: 'owner')
  end

  describe 'GET /api/v1/organizations/:organization_id/notification_routes' do
    it 'returns all routes for owner' do
      authenticated_get "/api/v1/organizations/#{organization.id}/notification_routes",
                        user: owner, organization: organization

      expect_success
      expect(json_response[:data].length).to eq(1)
      expect(json_response[:data].first[:notificationType]).to eq('cost_alert')
    end

    it 'returns only routes for the requesting organization' do
      create(:notification_route, organization: other_org,
             notification_type: 'token_alert', recipient_type: 'role', recipient_role: 'owner')

      authenticated_get "/api/v1/organizations/#{organization.id}/notification_routes",
                        user: owner, organization: organization

      expect_success
      expect(json_response[:data].length).to eq(1)
    end

    it 'returns 403 for non-owner member' do
      authenticated_get "/api/v1/organizations/#{organization.id}/notification_routes",
                        user: member, organization: organization

      expect_forbidden
    end
  end

  describe 'POST /api/v1/organizations/:organization_id/notification_routes' do
    context 'with role recipient' do
      it 'creates a route for owner' do
        authenticated_post "/api/v1/organizations/#{organization.id}/notification_routes",
                           user: owner, organization: organization,
                           params: { notification_type: 'token_alert', recipient_type: 'role',
                                     recipient_role: 'member' }

        expect_created
        expect(json_response[:data][:notificationType]).to eq('token_alert')
        expect(json_response[:data][:recipientRole]).to eq('member')
      end
    end

    context 'with user recipient' do
      it 'creates a route when recipient is an org member' do
        authenticated_post "/api/v1/organizations/#{organization.id}/notification_routes",
                           user: owner, organization: organization,
                           params: { notification_type: 'retention_warning', recipient_type: 'user',
                                     recipient_user_id: owner.id }

        expect_created
        expect(json_response[:data][:recipientUserId]).to eq(owner.id)
      end

      it 'returns 422 when recipient_user is not an org member' do
        outsider = create(:user)

        authenticated_post "/api/v1/organizations/#{organization.id}/notification_routes",
                           user: owner, organization: organization,
                           params: { notification_type: 'cost_alert', recipient_type: 'user',
                                     recipient_user_id: outsider.id }

        expect_unprocessable
      end
    end

    it 'returns 422 for duplicate route' do
      authenticated_post "/api/v1/organizations/#{organization.id}/notification_routes",
                         user: owner, organization: organization,
                         params: { notification_type: 'cost_alert', recipient_type: 'role',
                                   recipient_role: 'owner' }

      expect_unprocessable
    end

    it 'returns 422 when recipient_role is missing for role type' do
      authenticated_post "/api/v1/organizations/#{organization.id}/notification_routes",
                         user: owner, organization: organization,
                         params: { notification_type: 'cost_alert', recipient_type: 'role' }

      expect_unprocessable
    end

    it 'returns 403 for non-owner member' do
      authenticated_post "/api/v1/organizations/#{organization.id}/notification_routes",
                         user: member, organization: organization,
                         params: { notification_type: 'risk_alert', recipient_type: 'role',
                                   recipient_role: 'member' }

      expect_forbidden
    end
  end

  describe 'PATCH /api/v1/organizations/:organization_id/notification_routes/:id' do
    it 'toggles enabled for owner' do
      authenticated_patch "/api/v1/organizations/#{organization.id}/notification_routes/#{route.id}",
                          user: owner, organization: organization,
                          params: { enabled: false }

      expect_success
      expect(json_response[:data][:enabled]).to eq(false)
      expect(route.reload.enabled).to eq(false)
    end

    it 'returns 403 for non-owner member' do
      authenticated_patch "/api/v1/organizations/#{organization.id}/notification_routes/#{route.id}",
                          user: member, organization: organization,
                          params: { enabled: false }

      expect_forbidden
    end

    it 'returns 404 for route belonging to a different org' do
      other_route = create(:notification_route, organization: other_org)

      authenticated_patch "/api/v1/organizations/#{organization.id}/notification_routes/#{other_route.id}",
                          user: owner, organization: organization,
                          params: { enabled: false }

      expect_not_found
    end
  end

  describe 'DELETE /api/v1/organizations/:organization_id/notification_routes/:id' do
    it 'deletes the route for owner' do
      authenticated_delete "/api/v1/organizations/#{organization.id}/notification_routes/#{route.id}",
                           user: owner, organization: organization

      expect_no_content
      expect(NotificationRoute.exists?(route.id)).to be(false)
    end

    it 'returns 403 for non-owner member' do
      authenticated_delete "/api/v1/organizations/#{organization.id}/notification_routes/#{route.id}",
                           user: member, organization: organization

      expect_forbidden
    end

    it 'returns 404 for route belonging to a different org' do
      other_route = create(:notification_route, organization: other_org)

      authenticated_delete "/api/v1/organizations/#{organization.id}/notification_routes/#{other_route.id}",
                           user: owner, organization: organization

      expect_not_found
    end
  end
end

# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Api::V1::OrganizationConnectors', type: :request do
  let(:admin) { create(:user) }
  let(:member) { create(:user) }
  let(:organization) { create(:organization) }
  let!(:admin_membership) { create(:organization_membership, user: admin, organization: organization, role: 'admin') }
  let!(:member_membership) { create(:organization_membership, user: member, organization: organization, role: 'member') }
  let!(:connector) { create(:organization_connector, organization: organization, connector_type: 'github') }

  describe 'GET /api/v1/organizations/:organization_id/connectors' do
    it 'returns all connectors for the organization' do
      authenticated_get "/api/v1/organizations/#{organization.id}/connectors",
                        user: member,
                        organization: organization

      expect_success
      expect(json_data.length).to eq(1)
      expect(json_data.first[:connectorType]).to eq('github')
    end

    it 'filters by type' do
      create(:organization_connector, organization: organization, connector_type: 'gitlab')

      authenticated_get "/api/v1/organizations/#{organization.id}/connectors",
                        user: member,
                        organization: organization,
                        params: { type: 'github' }

      expect_success
      expect(json_data.length).to eq(1)
      expect(json_data.first[:connectorType]).to eq('github')
    end

    it 'filters by active status' do
      inactive = create(:organization_connector, organization: organization, connector_type: 'gitlab', is_active: false)

      authenticated_get "/api/v1/organizations/#{organization.id}/connectors",
                        user: member,
                        organization: organization,
                        params: { active: 'true' }

      expect_success
      expect(json_data.map { |c| c[:id] }).not_to include(inactive.id)
    end
  end

  describe 'GET /api/v1/organizations/:organization_id/connectors/:id' do
    it 'returns the connector' do
      authenticated_get "/api/v1/organizations/#{organization.id}/connectors/#{connector.id}",
                        user: member,
                        organization: organization

      expect_success
      expect(json_data[:id]).to eq(connector.id)
      expect(json_data[:connectorType]).to eq('github')
    end

    it 'does not expose tokens' do
      authenticated_get "/api/v1/organizations/#{organization.id}/connectors/#{connector.id}",
                        user: member,
                        organization: organization

      expect_success
      expect(json_data).not_to have_key(:accessToken)
      expect(json_data).not_to have_key(:refreshToken)
      expect(json_data).not_to have_key(:webhookSecret)
    end
  end

  describe 'POST /api/v1/organizations/:organization_id/connectors' do
    it 'creates a connector as admin' do
      authenticated_post "/api/v1/organizations/#{organization.id}/connectors",
                         user: admin,
                         organization: organization,
                         params: { connector_type: 'gitlab', access_token: 'secret' }

      expect_created
      expect(json_data[:connectorType]).to eq('gitlab')
    end

    it 'returns 403 for non-admins' do
      authenticated_post "/api/v1/organizations/#{organization.id}/connectors",
                         user: member,
                         organization: organization,
                         params: { connector_type: 'gitlab' }

      expect_forbidden
    end
  end

  describe 'PATCH /api/v1/organizations/:organization_id/connectors/:id' do
    it 'updates the connector as admin' do
      authenticated_patch "/api/v1/organizations/#{organization.id}/connectors/#{connector.id}",
                          user: admin,
                          organization: organization,
                          params: { is_active: false }

      expect_success
      expect(json_data[:isActive]).to be false
    end
  end

  describe 'DELETE /api/v1/organizations/:organization_id/connectors/:id' do
    it 'deletes the connector as admin' do
      authenticated_delete "/api/v1/organizations/#{organization.id}/connectors/#{connector.id}",
                           user: admin,
                           organization: organization

      expect_no_content
      expect(OrganizationConnector.find_by(id: connector.id)).to be_nil
    end

    it 'returns 403 for non-admins' do
      authenticated_delete "/api/v1/organizations/#{organization.id}/connectors/#{connector.id}",
                           user: member,
                           organization: organization

      expect_forbidden
    end
  end

  describe 'POST /api/v1/organizations/:organization_id/connectors/:id/test' do
    it 'tests the connector connection' do
      allow_any_instance_of(Oauth::GithubProvider).to receive(:test_connection)
        .and_return({ success: true, account: 'testuser', name: 'Test User' })

      authenticated_post "/api/v1/organizations/#{organization.id}/connectors/#{connector.id}/test",
                         user: admin,
                         organization: organization

      expect_success
      expect(json_data[:success]).to be true
    end
  end

  describe 'POST /api/v1/organizations/:organization_id/connectors/:id/sync' do
    it 'triggers a sync' do
      authenticated_post "/api/v1/organizations/#{organization.id}/connectors/#{connector.id}/sync",
                         user: admin,
                         organization: organization

      expect_success
      expect(connector.reload.last_sync_at).to be_present
    end
  end
end

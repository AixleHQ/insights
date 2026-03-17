# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Api::V1::ProjectConnectors', type: :request do
  let(:org_admin) { create(:user) }
  let(:project_member) { create(:user) }
  let(:non_member) { create(:user) }
  let(:organization) { create(:organization) }
  let(:project) { create(:project, organization: organization) }
  let!(:connector) { create(:project_connector, project: project, connector_type: 'anthropic') }

  before do
    create(:organization_membership, user: org_admin, organization: organization, role: 'admin')
    create(:organization_membership, user: project_member, organization: organization, role: 'member')
    create(:project_membership, user: org_admin, project: project, role: 'admin')
    create(:project_membership, user: project_member, project: project, role: 'member')
  end

  describe 'GET /api/v1/projects/:project_id/connectors' do
    it 'returns all connectors for the project for an org admin' do
      authenticated_get "/api/v1/projects/#{project.id}/connectors",
                        user: org_admin,
                        organization: organization

      expect_success
      expect(json_data.length).to eq(1)
      expect(json_data.first[:connectorType]).to eq('anthropic')
    end

    it 'returns connectors for a project member' do
      authenticated_get "/api/v1/projects/#{project.id}/connectors",
                        user: project_member,
                        organization: organization

      expect_success
      expect(json_data.length).to eq(1)
    end

    it 'returns 403 for non-members' do
      authenticated_get "/api/v1/projects/#{project.id}/connectors",
                        user: non_member

      expect_forbidden
    end

    it 'filters by type' do
      create(:project_connector, project: project, connector_type: 'openai')

      authenticated_get "/api/v1/projects/#{project.id}/connectors",
                        user: org_admin,
                        organization: organization,
                        params: { type: 'anthropic' }

      expect_success
      expect(json_data.length).to eq(1)
      expect(json_data.first[:connectorType]).to eq('anthropic')
    end

    it 'filters by active status' do
      inactive = create(:project_connector, :inactive, project: project, connector_type: 'openai')

      authenticated_get "/api/v1/projects/#{project.id}/connectors",
                        user: org_admin,
                        organization: organization,
                        params: { active: 'true' }

      expect_success
      expect(json_data.map { |c| c[:id] }).not_to include(inactive.id)
    end
  end

  describe 'GET /api/v1/projects/:project_id/connectors/:id' do
    it 'returns the connector' do
      authenticated_get "/api/v1/projects/#{project.id}/connectors/#{connector.id}",
                        user: project_member,
                        organization: organization

      expect_success
      expect(json_data[:id]).to eq(connector.id)
      expect(json_data[:connectorType]).to eq('anthropic')
    end

    it 'does not expose tokens' do
      authenticated_get "/api/v1/projects/#{project.id}/connectors/#{connector.id}",
                        user: project_member,
                        organization: organization

      expect_success
      expect(json_data).not_to have_key(:accessToken)
      expect(json_data).not_to have_key(:refreshToken)
    end

    it 'returns 403 for non-members' do
      authenticated_get "/api/v1/projects/#{project.id}/connectors/#{connector.id}",
                        user: non_member

      expect_forbidden
    end
  end

  describe 'POST /api/v1/projects/:project_id/connectors' do
    # Use a fresh project with no existing connectors to avoid uniqueness conflicts
    let(:fresh_project) { create(:project, organization: organization) }
    before do
      create(:project_membership, user: org_admin, project: fresh_project, role: 'admin')
    end

    context 'with AI provider connectors' do
      %w[anthropic openai openrouter gemini].each do |provider|
        describe "#{provider} connector" do
          let(:api_key) { 'valid-api-key-123' }
          let(:provider_class) { "Oauth::#{provider.capitalize}Provider".constantize }

          it "creates a #{provider} connector with is_active: true when API key is valid" do
            allow_any_instance_of(provider_class)
              .to receive(:test_connection).and_return({ success: true })

            authenticated_post "/api/v1/projects/#{fresh_project.id}/connectors",
                               user: org_admin,
                               organization: organization,
                               params: { connector_type: provider, access_token: api_key }

            expect_created
            expect(json_data[:connectorType]).to eq(provider)
            expect(json_data[:isActive]).to be true
          end

          it "returns 422 when #{provider} API key is invalid" do
            allow_any_instance_of(provider_class)
              .to receive(:test_connection).and_return({ success: false, error: 'Invalid API key' })

            authenticated_post "/api/v1/projects/#{fresh_project.id}/connectors",
                               user: org_admin,
                               organization: organization,
                               params: { connector_type: provider, access_token: 'bad-key' }

            expect_unprocessable
            expect(json_response[:errors][:access_token]).to include('Invalid API key')
          end

          it "saves #{provider} connector in error state when API key is invalid" do
            allow_any_instance_of(provider_class)
              .to receive(:test_connection).and_return({ success: false, error: 'Invalid API key' })

            expect {
              authenticated_post "/api/v1/projects/#{fresh_project.id}/connectors",
                                 user: org_admin,
                                 organization: organization,
                                 params: { connector_type: provider, access_token: 'bad-key' }
            }.to change(ProjectConnector, :count).by(1)

            saved = ProjectConnector.find_by!(project_id: fresh_project.id, connector_type: provider)
            expect(saved.is_active).to be false
            expect(saved.status).to eq('error')
            expect(saved.last_error).to eq('Invalid API key')
          end
        end
      end
    end

    it 'returns 403 for regular project members' do
      authenticated_post "/api/v1/projects/#{fresh_project.id}/connectors",
                         user: project_member,
                         organization: organization,
                         params: { connector_type: 'openai', access_token: 'key' }

      expect_forbidden
    end

    it 'returns 403 for non-members' do
      authenticated_post "/api/v1/projects/#{fresh_project.id}/connectors",
                         user: non_member,
                         params: { connector_type: 'openai', access_token: 'key' }

      expect_forbidden
    end

    it 'returns 422 when a connector of the same type already exists and is active' do
      # Create a pre-existing active connector on fresh_project
      create(:project_connector, project: fresh_project, connector_type: 'anthropic')

      authenticated_post "/api/v1/projects/#{fresh_project.id}/connectors",
                         user: org_admin,
                         organization: organization,
                         params: { connector_type: 'anthropic', access_token: 'key' }

      expect_unprocessable
    end

    it 'activates an existing error-state connector when retried with a valid key' do
      allow_any_instance_of(Oauth::AnthropicProvider)
        .to receive(:test_connection).and_return({ success: true })

      error_connector = create(:project_connector, :with_error, project: fresh_project,
                                                                connector_type: 'anthropic',
                                                                is_active: false)

      expect {
        authenticated_post "/api/v1/projects/#{fresh_project.id}/connectors",
                           user: org_admin,
                           organization: organization,
                           params: { connector_type: 'anthropic', access_token: 'valid-key' }
      }.not_to change(ProjectConnector, :count)

      expect_created
      expect(error_connector.reload.is_active).to be true
      expect(error_connector.reload.status).to eq('connected')
      expect(error_connector.reload.last_error).to be_nil
    end
  end

  describe 'PATCH /api/v1/projects/:project_id/connectors/:id' do
    it 'updates the connector as org admin' do
      authenticated_patch "/api/v1/projects/#{project.id}/connectors/#{connector.id}",
                          user: org_admin,
                          organization: organization,
                          params: { is_active: false }

      expect_success
      expect(json_data[:isActive]).to be false
    end

    it 'returns 403 for regular project members' do
      authenticated_patch "/api/v1/projects/#{project.id}/connectors/#{connector.id}",
                          user: project_member,
                          organization: organization,
                          params: { is_active: false }

      expect_forbidden
    end
  end

  describe 'DELETE /api/v1/projects/:project_id/connectors/:id' do
    it 'deletes the connector as org admin' do
      authenticated_delete "/api/v1/projects/#{project.id}/connectors/#{connector.id}",
                           user: org_admin,
                           organization: organization

      expect_no_content
      expect(ProjectConnector.find_by(id: connector.id)).to be_nil
    end

    it 'returns 403 for regular project members' do
      authenticated_delete "/api/v1/projects/#{project.id}/connectors/#{connector.id}",
                           user: project_member,
                           organization: organization

      expect_forbidden
    end
  end

  describe 'POST /api/v1/projects/:project_id/connectors/:id/test' do
    context 'when the connection succeeds' do
      before do
        allow_any_instance_of(Oauth::AnthropicProvider)
          .to receive(:test_connection).and_return({ success: true })
      end

      it 'returns success and marks connector as connected' do
        authenticated_post "/api/v1/projects/#{project.id}/connectors/#{connector.id}/test",
                           user: org_admin,
                           organization: organization

        expect_success
        expect(json_data[:success]).to be true
        expect(connector.reload.status).to eq('connected')
      end
    end

    context 'when the connection fails' do
      before do
        allow_any_instance_of(Oauth::AnthropicProvider)
          .to receive(:test_connection).and_return({ success: false, error: 'Unauthorized' })
      end

      it 'returns success with error details' do
        authenticated_post "/api/v1/projects/#{project.id}/connectors/#{connector.id}/test",
                           user: org_admin,
                           organization: organization

        expect_success
        expect(json_data[:success]).to be false
        expect(json_data[:error]).to eq('Unauthorized')
      end

      it 'persists the error in last_error' do
        authenticated_post "/api/v1/projects/#{project.id}/connectors/#{connector.id}/test",
                           user: org_admin,
                           organization: organization

        expect(connector.reload.last_error).to eq('Unauthorized')
        expect(connector.reload.status).to eq('error')
      end
    end

    it 'returns 403 for regular project members' do
      authenticated_post "/api/v1/projects/#{project.id}/connectors/#{connector.id}/test",
                         user: project_member,
                         organization: organization

      expect_forbidden
    end
  end

  describe 'POST /api/v1/projects/:project_id/connectors/:id/sync' do
    it 'marks connector as synced and updates last_sync_at' do
      authenticated_post "/api/v1/projects/#{project.id}/connectors/#{connector.id}/sync",
                         user: org_admin,
                         organization: organization

      expect_success
      expect(connector.reload.last_sync_at).to be_present
      expect(connector.reload.status).to eq('connected')
    end

    it 'returns 403 for regular project members' do
      authenticated_post "/api/v1/projects/#{project.id}/connectors/#{connector.id}/sync",
                         user: project_member,
                         organization: organization

      expect_forbidden
    end
  end
end

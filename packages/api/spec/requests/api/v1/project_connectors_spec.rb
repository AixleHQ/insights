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
    create(:organization_membership, user: org_admin, organization: organization, role: 'owner')
    create(:organization_membership, user: project_member, organization: organization, role: 'member')
    create(:project_membership, user: org_admin, project: project, role: "owner")
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

    it 'does not expose stale lastError when status is connected' do
      connector.update_columns(status: 'connected', is_active: true, last_error: 'stale from prior failure')

      authenticated_get "/api/v1/projects/#{project.id}/connectors",
                        user: org_admin,
                        organization: organization

      expect_success
      row = json_data.find { |c| c[:id] == connector.id }
      expect(row[:status]).to eq('connected')
      expect(row[:lastError]).to be_nil
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
      create(:project_membership, user: org_admin, project: fresh_project, role: "owner")
    end

    context 'with Slack connector' do
      let(:valid_webhook_url) { 'https://hooks.slack.com/services/T00000000/B00000000/EXAMPLE-WEBHOOK-SECRET' }

      it 'creates a slack connector when webhook URL is valid' do
        allow_any_instance_of(Oauth::SlackProvider)
          .to receive(:test_connection).and_return({ success: true })

        authenticated_post "/api/v1/projects/#{fresh_project.id}/connectors",
                           user: org_admin,
                           organization: organization,
                           params: { connector_type: 'slack', access_token: valid_webhook_url,
                                     external_org_name: '#general' }

        expect_created
        expect(json_data[:connectorType]).to eq('slack')
        expect(json_data[:isActive]).to be true
        expect(json_data[:externalAccountName]).to eq('#general')
      end

      it 'returns 422 when webhook URL format is invalid' do
        authenticated_post "/api/v1/projects/#{fresh_project.id}/connectors",
                           user: org_admin,
                           organization: organization,
                           params: { connector_type: 'slack', access_token: 'not-a-valid-url' }

        expect_unprocessable
        expect(json_response[:errors][:access_token]).to include('Invalid Slack webhook URL format')
      end

      it 'saves slack connector in error state when URL is invalid' do
        expect {
          authenticated_post "/api/v1/projects/#{fresh_project.id}/connectors",
                             user: org_admin,
                             organization: organization,
                             params: { connector_type: 'slack', access_token: 'bad-url' }
        }.to change(ProjectConnector, :count).by(1)

        saved = ProjectConnector.find_by!(project_id: fresh_project.id, connector_type: 'slack')
        expect(saved.is_active).to be false
        expect(saved.status).to eq('error')
        expect(saved.last_error).to eq('Invalid Slack webhook URL format')
      end

      it 'stores the channel name in external_org_name' do
        allow_any_instance_of(Oauth::SlackProvider)
          .to receive(:test_connection).and_return({ success: true })

        authenticated_post "/api/v1/projects/#{fresh_project.id}/connectors",
                           user: org_admin,
                           organization: organization,
                           params: { connector_type: 'slack', access_token: valid_webhook_url,
                                     external_org_name: '#alerts' }

        saved = ProjectConnector.find_by!(project_id: fresh_project.id, connector_type: 'slack')
        expect(saved.external_org_name).to eq('#alerts')
      end
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

    it 'creates a connector.create audit log on success' do
      allow_any_instance_of(Oauth::AnthropicProvider)
        .to receive(:test_connection).and_return({ success: true })

      expect {
        authenticated_post "/api/v1/projects/#{fresh_project.id}/connectors",
                           user: org_admin,
                           organization: organization,
                           params: { connector_type: 'anthropic', access_token: 'valid-key' }
      }.to change(ProjectAuditLog, :count).by(1)

      log = ProjectAuditLog.last
      expect(log.action).to eq('connector.create')
      expect(log.actor).to eq(org_admin)
      expect(log.tracked_changes['connector_type']).to eq('anthropic')
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

    it 'creates a connector.update audit log' do
      expect {
        authenticated_patch "/api/v1/projects/#{project.id}/connectors/#{connector.id}",
                            user: org_admin,
                            organization: organization,
                            params: { is_active: false }
      }.to change(ProjectAuditLog, :count).by(1)

      log = ProjectAuditLog.last
      expect(log.action).to eq('connector.update')
      expect(log.actor).to eq(org_admin)
      expect(log.tracked_changes['before']).to include('is_active' => true)
      expect(log.tracked_changes['after']).to include('is_active' => false)
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

    it 'creates a connector.delete audit log' do
      expect {
        authenticated_delete "/api/v1/projects/#{project.id}/connectors/#{connector.id}",
                             user: org_admin,
                             organization: organization
      }.to change(ProjectAuditLog, :count).by(1)

      log = ProjectAuditLog.last
      expect(log.action).to eq('connector.delete')
      expect(log.actor).to eq(org_admin)
      expect(log.tracked_changes['connector_type']).to eq('anthropic')
    end

    it 'returns 403 for regular project members' do
      authenticated_delete "/api/v1/projects/#{project.id}/connectors/#{connector.id}",
                           user: project_member,
                           organization: organization

      expect_forbidden
    end
  end

  describe 'POST /api/v1/projects/:project_id/connectors/:id/test' do
    it 'sets connector status to testing before running the test' do
      allow_any_instance_of(Oauth::AnthropicProvider).to receive(:test_connection) do
        expect(connector.reload.status).to eq('testing')
        { success: true }
      end

      authenticated_post "/api/v1/projects/#{project.id}/connectors/#{connector.id}/test",
                         user: org_admin,
                         organization: organization

      expect_success
    end

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

      it 'creates a connector.test audit log with success: true' do
        expect {
          authenticated_post "/api/v1/projects/#{project.id}/connectors/#{connector.id}/test",
                             user: org_admin,
                             organization: organization
        }.to change(ProjectAuditLog, :count).by(1)

        log = ProjectAuditLog.last
        expect(log.action).to eq('connector.test')
        expect(log.actor).to eq(org_admin)
        expect(log.tracked_changes['success']).to be true
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

    context 'with a Slack connector' do
      let(:slack_connector) { create(:project_connector, :slack, project: project) }
      let(:slack_provider) { instance_double(Oauth::SlackProvider) }

      before do
        allow(Oauth::BaseProvider).to receive(:for).and_return(slack_provider)
      end

      context 'when the Slack webhook responds with success' do
        before do
          allow(slack_provider).to receive(:test_connection).and_return({ success: true })
        end

        it 'returns 200 with success: true' do
          authenticated_post "/api/v1/projects/#{project.id}/connectors/#{slack_connector.id}/test",
                             user: org_admin,
                             organization: organization

          expect_success
          expect(json_data[:success]).to be true
          expect(json_data[:message]).to eq('Connection successful')
        end

        it 'marks the connector as connected' do
          authenticated_post "/api/v1/projects/#{project.id}/connectors/#{slack_connector.id}/test",
                             user: org_admin,
                             organization: organization

          expect(slack_connector.reload.status).to eq('connected')
          expect(slack_connector.reload.last_error).to be_nil
        end
      end

      context 'when the Slack webhook returns a non-2xx HTTP response' do
        before do
          allow(slack_provider).to receive(:test_connection)
            .and_return({ success: false, error: 'Slack webhook error (HTTP 403)' })
        end

        it 'returns 200 with success: false and the error message' do
          authenticated_post "/api/v1/projects/#{project.id}/connectors/#{slack_connector.id}/test",
                             user: org_admin,
                             organization: organization

          expect_success
          expect(json_data[:success]).to be false
          expect(json_data[:error]).to eq('Slack webhook error (HTTP 403)')
        end

        it 'sets last_error and status to error on the connector' do
          authenticated_post "/api/v1/projects/#{project.id}/connectors/#{slack_connector.id}/test",
                             user: org_admin,
                             organization: organization

          expect(slack_connector.reload.last_error).to eq('Slack webhook error (HTTP 403)')
          expect(slack_connector.reload.status).to eq('error')
        end
      end

      context 'when the webhook URL format is invalid' do
        before do
          allow(slack_provider).to receive(:test_connection)
            .and_return({ success: false, error: 'Invalid Slack webhook URL format' })
        end

        it 'returns 200 with success: false and the format error' do
          authenticated_post "/api/v1/projects/#{project.id}/connectors/#{slack_connector.id}/test",
                             user: org_admin,
                             organization: organization

          expect_success
          expect(json_data[:success]).to be false
          expect(json_data[:error]).to eq('Invalid Slack webhook URL format')
        end

        it 'persists the format error in last_error' do
          authenticated_post "/api/v1/projects/#{project.id}/connectors/#{slack_connector.id}/test",
                             user: org_admin,
                             organization: organization

          expect(slack_connector.reload.last_error).to eq('Invalid Slack webhook URL format')
          expect(slack_connector.reload.status).to eq('error')
        end
      end

      context 'when a network error occurs' do
        before do
          allow(slack_provider).to receive(:test_connection)
            .and_return({ success: false, error: 'Connection error: connection refused' })
        end

        it 'returns 200 with success: false and a connection error message' do
          authenticated_post "/api/v1/projects/#{project.id}/connectors/#{slack_connector.id}/test",
                             user: org_admin,
                             organization: organization

          expect_success
          expect(json_data[:success]).to be false
          expect(json_data[:error]).to include('Connection error')
        end

        it 'persists the network error in last_error' do
          authenticated_post "/api/v1/projects/#{project.id}/connectors/#{slack_connector.id}/test",
                             user: org_admin,
                             organization: organization

          expect(slack_connector.reload.last_error).to include('Connection error')
          expect(slack_connector.reload.status).to eq('error')
        end
      end

      context 'when an unexpected error occurs' do
        before do
          allow(slack_provider).to receive(:test_connection).and_raise(RuntimeError, 'unexpected failure')
        end

        it 'returns 200 with success: false and the error message' do
          authenticated_post "/api/v1/projects/#{project.id}/connectors/#{slack_connector.id}/test",
                             user: org_admin,
                             organization: organization

          expect_success
          expect(json_data[:success]).to be false
          expect(json_data[:error]).to eq('unexpected failure')
        end

        it 'persists the error in last_error' do
          authenticated_post "/api/v1/projects/#{project.id}/connectors/#{slack_connector.id}/test",
                             user: org_admin,
                             organization: organization

          expect(slack_connector.reload.last_error).to eq('unexpected failure')
          expect(slack_connector.reload.status).to eq('error')
        end
      end
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

    it 'creates a connector.sync audit log' do
      expect {
        authenticated_post "/api/v1/projects/#{project.id}/connectors/#{connector.id}/sync",
                           user: org_admin,
                           organization: organization
      }.to change(ProjectAuditLog, :count).by(1)

      log = ProjectAuditLog.last
      expect(log.action).to eq('connector.sync')
      expect(log.actor).to eq(org_admin)
      expect(log.tracked_changes['connector_type']).to eq('anthropic')
    end

    it 'returns 403 for regular project members' do
      authenticated_post "/api/v1/projects/#{project.id}/connectors/#{connector.id}/sync",
                         user: project_member,
                         organization: organization

      expect_forbidden
    end
  end
end

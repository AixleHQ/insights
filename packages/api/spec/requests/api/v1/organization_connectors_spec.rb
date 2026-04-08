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
      inactive = create(:organization_connector, organization: organization, connector_type: 'gitlab', is_active: false, status: 'disconnected')

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

    context 'with slack webhook connector' do
      let(:valid_webhook_url) { 'https://hooks.slack.com/services/T12345678/B12345678/EXAMPLE-WEBHOOK-SECRET' }

      it 'creates a slack connector with a valid webhook URL' do
        allow_any_instance_of(Oauth::SlackProvider).to receive(:test_connection).and_return({ success: true })

        authenticated_post "/api/v1/organizations/#{organization.id}/connectors",
                           user: admin,
                           organization: organization,
                           params: { connector_type: 'slack', access_token: valid_webhook_url, external_account_name: '#general' }

        expect_created
        expect(json_data[:connectorType]).to eq('slack')
      end

      it 'returns 422 when the webhook URL format is invalid' do
        authenticated_post "/api/v1/organizations/#{organization.id}/connectors",
                           user: admin,
                           organization: organization,
                           params: { connector_type: 'slack', access_token: 'https://example.com/not-a-slack-webhook' }

        expect_unprocessable
        expect(json_response[:errors][:access_token]).to include('Invalid Slack webhook URL format')
      end

      it 'returns 422 when the webhook URL is blank' do
        authenticated_post "/api/v1/organizations/#{organization.id}/connectors",
                           user: admin,
                           organization: organization,
                           params: { connector_type: 'slack', access_token: '' }

        expect_unprocessable
        expect(json_response[:errors][:access_token]).to include('Webhook URL is required')
      end

      it 'does not create a slack connector when the webhook URL is invalid' do
        expect {
          authenticated_post "/api/v1/organizations/#{organization.id}/connectors",
                             user: admin,
                             organization: organization,
                             params: { connector_type: 'slack', access_token: 'not-a-url' }
        }.not_to change(OrganizationConnector, :count)
      end
    end

    context 'with AI provider connectors' do
      %w[anthropic openai openrouter gemini].each do |provider|
        describe "#{provider} connector" do
          let(:api_key) { 'valid-api-key-123' }

          it "creates a #{provider} connector when API key is valid" do
            allow_any_instance_of("Oauth::#{provider.capitalize}Provider".constantize)
              .to receive(:test_connection).and_return({ success: true })

            authenticated_post "/api/v1/organizations/#{organization.id}/connectors",
                               user: admin,
                               organization: organization,
                               params: { connector_type: provider, access_token: api_key }

            expect_created
            expect(json_data[:connectorType]).to eq(provider)
          end

          it "returns 422 when #{provider} API key is invalid" do
            allow_any_instance_of("Oauth::#{provider.capitalize}Provider".constantize)
              .to receive(:test_connection).and_return({ success: false, error: 'Invalid API key' })

            authenticated_post "/api/v1/organizations/#{organization.id}/connectors",
                               user: admin,
                               organization: organization,
                               params: { connector_type: provider, access_token: 'bad-key' }

            expect_unprocessable
            expect(json_response[:errors][:access_token]).to include('Invalid API key')
          end

          it "does not create a #{provider} connector when API key is invalid" do
            allow_any_instance_of("Oauth::#{provider.capitalize}Provider".constantize)
              .to receive(:test_connection).and_return({ success: false, error: 'Invalid API key' })

            expect {
              authenticated_post "/api/v1/organizations/#{organization.id}/connectors",
                                 user: admin,
                                 organization: organization,
                                 params: { connector_type: provider, access_token: 'bad-key' }
            }.not_to change(OrganizationConnector, :count)
          end
        end
      end
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
    it 'sets connector status to testing before running the test' do
      allow_any_instance_of(Oauth::GithubProvider).to receive(:test_connection) do
        expect(connector.reload.status).to eq('testing')
        { success: true, account: 'testuser', name: 'Test User' }
      end

      authenticated_post "/api/v1/organizations/#{organization.id}/connectors/#{connector.id}/test",
                         user: admin,
                         organization: organization

      expect_success
    end

    it 'marks connector as connected on success' do
      allow_any_instance_of(Oauth::GithubProvider).to receive(:test_connection)
        .and_return({ success: true, account: 'testuser', name: 'Test User' })

      authenticated_post "/api/v1/organizations/#{organization.id}/connectors/#{connector.id}/test",
                         user: admin,
                         organization: organization

      expect_success
      expect(json_data[:success]).to be true
      expect(connector.reload.status).to eq('connected')
    end

    it 'marks connector as error on failure' do
      allow_any_instance_of(Oauth::GithubProvider).to receive(:test_connection)
        .and_return({ success: false, error: 'Token expired' })

      authenticated_post "/api/v1/organizations/#{organization.id}/connectors/#{connector.id}/test",
                         user: admin,
                         organization: organization

      expect_success
      expect(json_data[:success]).to be false
      expect(connector.reload.status).to eq('error')
      expect(connector.reload.last_error).to eq('Token expired')
    end

    it 'marks connector as error and returns 200 when an unexpected exception is raised' do
      allow_any_instance_of(Oauth::GithubProvider).to receive(:test_connection)
        .and_raise(RuntimeError, 'unexpected failure')

      authenticated_post "/api/v1/organizations/#{organization.id}/connectors/#{connector.id}/test",
                         user: admin,
                         organization: organization

      expect_success
      expect(json_data[:success]).to be false
      expect(connector.reload.status).to eq('error')
      expect(connector.reload.last_error).to eq('unexpected failure')
    end

    it 'returns 403 for non-admins' do
      authenticated_post "/api/v1/organizations/#{organization.id}/connectors/#{connector.id}/test",
                         user: member,
                         organization: organization

      expect_forbidden
    end

    context 'with a slack connector' do
      let!(:slack_connector) { create(:organization_connector, :slack, organization: organization) }

      context 'when Slack accepts the test message' do
        before do
          allow_any_instance_of(Oauth::SlackProvider).to receive(:test_connection)
            .and_return({ success: true })
        end

        it 'returns success' do
          authenticated_post "/api/v1/organizations/#{organization.id}/connectors/#{slack_connector.id}/test",
                             user: admin,
                             organization: organization

          expect_success
          expect(json_data[:success]).to be true
        end
      end

      context 'when Slack rejects the test message' do
        before do
          allow_any_instance_of(Oauth::SlackProvider).to receive(:test_connection)
            .and_return({ success: false, error: 'Slack webhook error (HTTP 403)' })
        end

        it 'returns a structured error' do
          authenticated_post "/api/v1/organizations/#{organization.id}/connectors/#{slack_connector.id}/test",
                             user: admin,
                             organization: organization

          expect_success
          expect(json_data[:success]).to be false
          expect(json_data[:error]).to eq('Slack webhook error (HTTP 403)')
        end

        it 'persists the error in last_error' do
          authenticated_post "/api/v1/organizations/#{organization.id}/connectors/#{slack_connector.id}/test",
                             user: admin,
                             organization: organization

          expect(slack_connector.reload.last_error).to eq('Slack webhook error (HTTP 403)')
        end
      end
    end
  end

  describe 'POST /api/v1/organizations/:organization_id/connectors/:id/sync' do
    it 'triggers a sync' do
      allow(GithubSyncJob).to receive(:perform_later)

      authenticated_post "/api/v1/organizations/#{organization.id}/connectors/#{connector.id}/sync",
                         user: admin,
                         organization: organization

      expect_success
      expect(connector.reload.last_sync_at).to be_present
      expect(GithubSyncJob).to have_received(:perform_later).with(connector.id)
    end
  end

  describe 'GET /api/v1/organizations/:organization_id/connectors/:id/available_repos' do
    let(:available_repos) do
      [
        { external_id: "1", name: "repo-a", full_name: "org/repo-a", html_url: "https://github.com/org/repo-a",
          default_branch: "main", is_private: false },
        { external_id: "2", name: "repo-b", full_name: "org/repo-b", html_url: "https://github.com/org/repo-b",
          default_branch: "main", is_private: true }
      ]
    end

    let(:provider_double) { instance_double(Oauth::GithubProvider) }

    before do
      allow(Oauth::BaseProvider).to receive(:for).with(connector).and_return(provider_double)
      allow(provider_double).to receive(:fetch_repositories).and_return(available_repos)
    end

    it 'returns available repos for org admin' do
      authenticated_get "/api/v1/organizations/#{organization.id}/connectors/#{connector.id}/available_repos",
                        user: admin,
                        organization: organization

      expect_success
      expect(json_data.length).to eq(2)
      expect(json_data.first[:fullName]).to eq("org/repo-a")
    end

    it 'marks already-linked repos with already_linked: true' do
      project = create(:project, organization: organization)
      create(:repository, organization_connector: connector, project: project, external_id: "1")

      authenticated_get "/api/v1/organizations/#{organization.id}/connectors/#{connector.id}/available_repos",
                        user: admin,
                        organization: organization

      expect_success
      linked = json_data.find { |r| r[:externalId] == "1" }
      unlinked = json_data.find { |r| r[:externalId] == "2" }
      expect(linked[:alreadyLinked]).to be true
      expect(unlinked[:alreadyLinked]).to be false
    end

    it 'returns 403 for org members' do
      authenticated_get "/api/v1/organizations/#{organization.id}/connectors/#{connector.id}/available_repos",
                        user: member,
                        organization: organization

      expect_forbidden
    end
  end
end

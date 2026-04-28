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

  describe 'GET /api/v1/organizations/:organization_id/connectors/:id/sync_status' do
    let!(:openrouter_connector) do
      create(:organization_connector, organization: organization, connector_type: 'openrouter',
             status: 'connected', last_sync_at: 1.hour.ago, last_error: nil)
    end

    it 'returns sync status for org admin' do
      authenticated_get "/api/v1/organizations/#{organization.id}/connectors/#{openrouter_connector.id}/sync_status",
                        user: admin,
                        organization: organization

      expect_success
      expect(json_response[:connector_type]).to eq('openrouter')
      expect(json_response[:status]).to eq('connected')
      expect(json_response[:last_sync_at]).to be_present
      expect(json_response[:last_error]).to be_nil
      expect(json_response[:total_events]).to eq(0)
    end

    it 'returns sync status for org member' do
      authenticated_get "/api/v1/organizations/#{organization.id}/connectors/#{openrouter_connector.id}/sync_status",
                        user: member,
                        organization: organization

      expect_success
      expect(json_response[:connector_type]).to eq('openrouter')
    end

    it 'counts only tool_events with matching tool_name' do
      user_in_org = create(:user)
      create(:organization_membership, user: user_in_org, organization: organization, role: 'member')

      create(:tool_event, organization: organization, tool_name: 'openrouter_api', user: user_in_org)
      create(:tool_event, organization: organization, tool_name: 'openrouter_api', user: user_in_org)
      create(:tool_event, organization: organization, tool_name: 'claude_code', user: user_in_org)

      authenticated_get "/api/v1/organizations/#{organization.id}/connectors/#{openrouter_connector.id}/sync_status",
                        user: admin,
                        organization: organization

      expect_success
      expect(json_response[:total_events]).to eq(2)
    end

    it 'returns null last_error when connection is healthy' do
      openrouter_connector.update!(last_error: nil)

      authenticated_get "/api/v1/organizations/#{organization.id}/connectors/#{openrouter_connector.id}/sync_status",
                        user: admin,
                        organization: organization

      expect_success
      expect(json_response[:last_error]).to be_nil
    end

    it 'returns last_error when connector has an error' do
      openrouter_connector.mark_error!('Rate limit exceeded')

      authenticated_get "/api/v1/organizations/#{organization.id}/connectors/#{openrouter_connector.id}/sync_status",
                        user: admin,
                        organization: organization

      expect_success
      expect(json_response[:last_error]).to eq('Rate limit exceeded')
    end

    it 'returns 404 when connector does not belong to org' do
      other_org = create(:organization)
      other_connector = create(:organization_connector, organization: other_org, connector_type: 'openrouter')

      authenticated_get "/api/v1/organizations/#{organization.id}/connectors/#{other_connector.id}/sync_status",
                        user: admin,
                        organization: organization

      expect_not_found
    end

    it 'returns 401 without authentication' do
      get "/api/v1/organizations/#{organization.id}/connectors/#{openrouter_connector.id}/sync_status",
          headers: { 'X-Organization-ID' => organization.id }

      expect_unauthorized
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

  describe 'GET /api/v1/organizations/:organization_id/connectors/authorize/:type' do
    let(:fake_provider) do
      Class.new do
        def self.authorization_url(organization_id:, redirect_uri:, state: nil)
          "https://github.com/login/oauth/authorize?client_id=test&redirect_uri=#{CGI.escape(redirect_uri)}&state=#{organization_id}:abc123"
        end
      end
    end

    before do
      allow(Oauth::BaseProvider).to receive(:provider_class).with('github').and_return(fake_provider)
    end

    it 'returns an authorization URL containing the frontend callback as redirect_uri' do
      frontend_url = ENV.fetch('FRONTEND_URL', 'http://localhost:5173')

      authenticated_get "/api/v1/organizations/#{organization.id}/connectors/authorize/github",
                        user: admin,
                        organization: organization

      expect_success
      authorize_url = json_data[:authorize_url]
      expect(authorize_url).to include(CGI.escape("#{frontend_url}/integrations/callback"))
    end

    it 'returns 403 for org members' do
      authenticated_get "/api/v1/organizations/#{organization.id}/connectors/authorize/github",
                        user: member,
                        organization: organization

      expect_forbidden
    end

    context 'when provider credentials are missing' do
      before do
        allow(Oauth::BaseProvider).to receive(:provider_class).with('github').and_call_original
        allow(Oauth::GithubProvider).to receive(:client_id).and_return(nil)
      end

      it 'returns 503 with an integration_not_configured code' do
        authenticated_get "/api/v1/organizations/#{organization.id}/connectors/authorize/github",
                          user: admin,
                          organization: organization

        expect(response).to have_http_status(:service_unavailable)
        expect(json_response[:code]).to eq('integration_not_configured')
        expect(json_error).to include('not configured')
      end
    end
  end

  describe 'POST /api/v1/organizations/:organization_id/connectors/callback' do
    let(:fake_provider) do
      Class.new do
        def self.exchange_code(_code, redirect_uri:)
          {
            access_token: 'gho_token123',
            refresh_token: nil,
            expires_at: nil,
            account_id: 'gh-42',
            account_name: 'octocat'
          }
        end
      end
    end

    before do
      allow(Oauth::BaseProvider).to receive(:provider_class).with('github').and_return(fake_provider)
    end

    it 'creates a connector and returns it with connected status' do
      connector.destroy!

      authenticated_post "/api/v1/organizations/#{organization.id}/connectors/callback",
                         user: admin,
                         organization: organization,
                         params: { connector_type: 'github', code: 'oauth_code_abc' }

      expect_success
      expect(json_data[:connectorType]).to eq('github')
      expect(json_data[:status]).to eq('connected')
      expect(json_data[:externalAccountName]).to eq('octocat')
    end

    it 'updates an existing connector when one already exists' do
      expect {
        authenticated_post "/api/v1/organizations/#{organization.id}/connectors/callback",
                           user: admin,
                           organization: organization,
                           params: { connector_type: 'github', code: 'oauth_code_abc' }
      }.not_to change(OrganizationConnector, :count)

      expect_success
      expect(connector.reload.status).to eq('connected')
    end

    it 'returns 403 for org members' do
      authenticated_post "/api/v1/organizations/#{organization.id}/connectors/callback",
                         user: member,
                         organization: organization,
                         params: { connector_type: 'github', code: 'oauth_code_abc' }

      expect_forbidden
    end

    context 'when the OAuth provider returns an error' do
      before do
        allow(fake_provider).to receive(:exchange_code).and_raise('OAuth error: bad_verification_code')
      end

      it 'returns 422' do
        expect {
          authenticated_post "/api/v1/organizations/#{organization.id}/connectors/callback",
                             user: admin,
                             organization: organization,
                             params: { connector_type: 'github', code: 'bad_code' }
        }.to raise_error(RuntimeError, /OAuth error/)
      end
    end

    context 'when provider credentials are missing' do
      before do
        allow(Oauth::BaseProvider).to receive(:provider_class).with('github').and_call_original
        allow(Oauth::GithubProvider).to receive(:client_secret).and_return(nil)
      end

      it 'returns 503 with an integration_not_configured code' do
        authenticated_post "/api/v1/organizations/#{organization.id}/connectors/callback",
                           user: admin,
                           organization: organization,
                           params: { connector_type: 'github', code: 'oauth_code_abc' }

        expect(response).to have_http_status(:service_unavailable)
        expect(json_response[:code]).to eq('integration_not_configured')
        expect(json_error).to include('not configured')
      end
    end
  end

  describe 'GET /api/v1/organizations/:organization_id/connectors/:id/available_projects' do
    let!(:jira_connector) { create(:organization_connector, :jira, organization: organization) }
    let(:jira_projects) do
      [
        { id: "10001", key: "SCRUM", name: "Scrum Project", projectTypeKey: "software" },
        { id: "10002", key: "OPS", name: "Operations", projectTypeKey: "business" }
      ]
    end
    let(:provider_double) { instance_double(Oauth::JiraProvider) }

    before do
      allow(Oauth::BaseProvider).to receive(:for).with(jira_connector).and_return(provider_double)
      allow(provider_double).to receive(:fetch_projects).and_return(jira_projects)
    end

    it 'returns available Jira projects for org admin' do
      authenticated_get "/api/v1/organizations/#{organization.id}/connectors/#{jira_connector.id}/available_projects",
                        user: admin,
                        organization: organization

      expect_success
      expect(json_data.length).to eq(2)
      expect(json_data.first[:key]).to eq("SCRUM")
      expect(json_data.first[:name]).to eq("Scrum Project")
    end

    it 'camelCases keys in the response' do
      authenticated_get "/api/v1/organizations/#{organization.id}/connectors/#{jira_connector.id}/available_projects",
                        user: admin,
                        organization: organization

      expect_success
      expect(json_data.first).to have_key(:projectTypeKey)
    end

    it 'returns 403 for org members' do
      authenticated_get "/api/v1/organizations/#{organization.id}/connectors/#{jira_connector.id}/available_projects",
                        user: member,
                        organization: organization

      expect_forbidden
    end

    it 'returns 401 without authentication' do
      get "/api/v1/organizations/#{organization.id}/connectors/#{jira_connector.id}/available_projects",
          headers: { 'X-Organization-ID' => organization.id }

      expect_unauthorized
    end
  end
end

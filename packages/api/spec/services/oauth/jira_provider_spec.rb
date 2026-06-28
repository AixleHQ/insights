# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Oauth::JiraProvider, type: :service do
  let(:connector) { instance_double('OrganizationConnector', access_token: 'jira-test123', token_expired?: false) }
  let(:provider) { described_class.new(connector) }

  describe '#test_connection' do
    context 'when the token is valid and sites are accessible' do
      it 'returns success with the first site name' do
        stub_request(:get, 'https://api.atlassian.com/oauth/token/accessible-resources')
          .with(headers: { 'Authorization' => 'Bearer jira-test123' })
          .to_return(
            status: 200,
            body: [ { id: 'cloud-id-1', name: 'My Jira Site' } ].to_json,
            headers: { 'Content-Type' => 'application/json' }
          )

        result = provider.test_connection

        expect(result[:success]).to be true
        expect(result[:account]).to eq('My Jira Site')
      end
    end

    context 'when the token is valid but no sites are accessible' do
      it 'returns failure with descriptive error' do
        stub_request(:get, 'https://api.atlassian.com/oauth/token/accessible-resources')
          .to_return(status: 200, body: '[]', headers: { 'Content-Type' => 'application/json' })

        result = provider.test_connection

        expect(result[:success]).to be false
        expect(result[:error]).to eq('No accessible Jira sites found')
      end
    end

    context 'when the token is invalid' do
      it 'returns failure with error message' do
        stub_request(:get, 'https://api.atlassian.com/oauth/token/accessible-resources')
          .to_return(status: 401, body: '{"message":"Unauthorized"}')

        result = provider.test_connection

        expect(result[:success]).to be false
        expect(result[:error]).to include('401')
      end
    end

    context 'when a network error occurs' do
      it 'returns failure with connection error message' do
        stub_request(:get, 'https://api.atlassian.com/oauth/token/accessible-resources')
          .to_raise(Faraday::ConnectionFailed.new('connection refused'))

        result = provider.test_connection

        expect(result[:success]).to be false
        expect(result[:error]).to include('Connection error')
      end
    end
  end

  describe '#fetch_projects' do
    context 'when resources and projects are accessible' do
      before do
        stub_request(:get, 'https://api.atlassian.com/oauth/token/accessible-resources')
          .to_return(
            status: 200,
            body: [ { id: 'cloud-id-1', name: 'My Site' } ].to_json,
            headers: { 'Content-Type' => 'application/json' }
          )
      end

      it 'returns a list of mapped projects' do
        stub_request(:get, 'https://api.atlassian.com/ex/jira/cloud-id-1/rest/api/3/project/search')
          .to_return(
            status: 200,
            body: {
              values: [
                { id: '10001', key: 'PROJ', name: 'My Project', avatarUrls: { '48x48' => 'https://example.com/avatar.png' } }
              ]
            }.to_json,
            headers: { 'Content-Type' => 'application/json' }
          )

        result = provider.fetch_projects

        expect(result.length).to eq(1)
        expect(result.first[:external_id]).to eq('10001')
        expect(result.first[:key]).to eq('PROJ')
        expect(result.first[:name]).to eq('My Project')
        expect(result.first[:avatar_url]).to eq('https://example.com/avatar.png')
      end
    end

    context 'when there are no accessible resources' do
      it 'returns an empty array' do
        stub_request(:get, 'https://api.atlassian.com/oauth/token/accessible-resources')
          .to_return(status: 200, body: '[]', headers: { 'Content-Type' => 'application/json' })

        expect(provider.fetch_projects).to eq([])
      end
    end

    context 'when the resources request fails' do
      it 'returns an empty array' do
        stub_request(:get, 'https://api.atlassian.com/oauth/token/accessible-resources')
          .to_return(status: 401, body: '{}')

        expect(provider.fetch_projects).to eq([])
      end
    end
  end

  describe '.fetch_account_info' do
    context 'when the request succeeds with resources' do
      it 'returns account_id and account_name from the first resource' do
        stub_request(:get, 'https://api.atlassian.com/oauth/token/accessible-resources')
          .to_return(
            status: 200,
            body: [ { id: 'cloud-id-1', name: 'My Site' } ].to_json,
            headers: { 'Content-Type' => 'application/json' }
          )

        result = described_class.fetch_account_info('jira-test123')

        expect(result[:account_id]).to eq('cloud-id-1')
        expect(result[:account_name]).to eq('My Site')
      end
    end

    context 'when the response is empty' do
      it 'returns an empty hash' do
        stub_request(:get, 'https://api.atlassian.com/oauth/token/accessible-resources')
          .to_return(status: 200, body: '[]', headers: { 'Content-Type' => 'application/json' })

        expect(described_class.fetch_account_info('jira-test123')).to eq({})
      end
    end

    context 'when the request fails' do
      it 'returns an empty hash' do
        stub_request(:get, 'https://api.atlassian.com/oauth/token/accessible-resources')
          .to_return(status: 401, body: '{}')

        expect(described_class.fetch_account_info('bad-token')).to eq({})
      end
    end
  end

  describe '.authorization_url' do
    context 'when client_id is missing' do
      before { allow(described_class).to receive(:client_id).and_return(nil) }

      it 'raises MissingCredentialsError' do
        expect {
          described_class.authorization_url(organization_id: 'org-1', redirect_uri: 'https://example.com/cb')
        }.to raise_error(Oauth::MissingCredentialsError, /Jira.*missing client_id/)
      end
    end

    context 'when client_id is present' do
      before do
        allow(described_class).to receive(:client_id).and_return('atlassian-client-id')
      end

      it 'builds a URL pointing to Atlassian authorize endpoint' do
        url = described_class.authorization_url(
          organization_id: 'org-1',
          redirect_uri: 'http://localhost:5173/integrations/callback'
        )

        expect(url).to start_with('https://auth.atlassian.com/authorize')
        expect(url).to include('client_id=atlassian-client-id')
      end

      it 'includes the audience param for Atlassian' do
        url = described_class.authorization_url(
          organization_id: 'org-1',
          redirect_uri: 'http://localhost:5173/integrations/callback'
        )

        expect(url).to include('audience=api.atlassian.com')
      end

      it 'includes prompt=consent' do
        url = described_class.authorization_url(
          organization_id: 'org-1',
          redirect_uri: 'http://localhost:5173/integrations/callback'
        )

        expect(url).to include('prompt=consent')
      end
    end
  end
end

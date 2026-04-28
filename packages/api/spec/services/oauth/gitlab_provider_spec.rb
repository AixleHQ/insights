# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Oauth::GitlabProvider, type: :service do
  let(:connector) { instance_double('OrganizationConnector', access_token: 'glpat-test123') }
  let(:provider) { described_class.new(connector) }

  describe '#test_connection' do
    context 'when the token is valid' do
      it 'returns success with account and name' do
        stub_request(:get, 'https://gitlab.com/api/v4/user')
          .with(headers: { 'Authorization' => 'Bearer glpat-test123' })
          .to_return(
            status: 200,
            body: { username: 'gitlabuser', name: 'GitLab User' }.to_json,
            headers: { 'Content-Type' => 'application/json' }
          )

        result = provider.test_connection

        expect(result[:success]).to be true
        expect(result[:account]).to eq('gitlabuser')
        expect(result[:name]).to eq('GitLab User')
      end
    end

    context 'when the token is invalid' do
      it 'returns failure with error message' do
        stub_request(:get, 'https://gitlab.com/api/v4/user')
          .to_return(status: 401, body: '{"message":"401 Unauthorized"}')

        result = provider.test_connection

        expect(result[:success]).to be false
        expect(result[:error]).to include('401')
      end
    end

    context 'when a network error occurs' do
      it 'returns failure with connection error message' do
        stub_request(:get, 'https://gitlab.com/api/v4/user')
          .to_raise(Faraday::ConnectionFailed.new('connection refused'))

        result = provider.test_connection

        expect(result[:success]).to be false
        expect(result[:error]).to include('Connection error')
      end
    end
  end

  describe '#fetch_repositories' do
    context 'when the request succeeds' do
      it 'returns a list of mapped repositories' do
        projects = [
          {
            id: 10,
            name: 'my-project',
            path_with_namespace: 'group/my-project',
            description: 'A GitLab project',
            default_branch: 'main',
            http_url_to_repo: 'https://gitlab.com/group/my-project.git',
            web_url: 'https://gitlab.com/group/my-project',
            visibility: 'private'
          }
        ]

        stub_request(:get, 'https://gitlab.com/api/v4/projects')
          .with(query: hash_including('page' => '1', 'per_page' => '100', 'membership' => 'true'))
          .to_return(
            status: 200,
            body: projects.to_json,
            headers: { 'Content-Type' => 'application/json' }
          )

        result = provider.fetch_repositories

        expect(result.length).to eq(1)
        expect(result.first[:external_id]).to eq('10')
        expect(result.first[:name]).to eq('my-project')
        expect(result.first[:full_name]).to eq('group/my-project')
        expect(result.first[:is_private]).to be true
      end
    end

    context 'when the request fails' do
      it 'returns an empty array' do
        stub_request(:get, 'https://gitlab.com/api/v4/projects')
          .with(query: hash_including('page' => '1', 'per_page' => '100', 'membership' => 'true'))
          .to_return(status: 401, body: '{}')

        expect(provider.fetch_repositories).to eq([])
      end
    end
  end

  describe '.fetch_account_info' do
    context 'when the request succeeds' do
      it 'returns account_id and account_name' do
        stub_request(:get, 'https://gitlab.com/api/v4/user')
          .to_return(
            status: 200,
            body: { id: 99, username: 'gitlabuser' }.to_json,
            headers: { 'Content-Type' => 'application/json' }
          )

        result = described_class.fetch_account_info('glpat-test123')

        expect(result[:account_id]).to eq('99')
        expect(result[:account_name]).to eq('gitlabuser')
      end
    end

    context 'when the request fails' do
      it 'returns an empty hash' do
        stub_request(:get, 'https://gitlab.com/api/v4/user')
          .to_return(status: 401, body: '{}')

        expect(described_class.fetch_account_info('bad-token')).to eq({})
      end
    end
  end

  describe '.authorization_url' do
    before do
      allow(described_class).to receive(:client_id).and_return('gl-client-id')
    end

    it 'builds a URL pointing to GitLab authorize endpoint' do
      url = described_class.authorization_url(
        organization_id: 'org-1',
        redirect_uri: 'http://localhost:5173/integrations/callback'
      )

      expect(url).to start_with('https://gitlab.com/oauth/authorize')
      expect(url).to include('client_id=gl-client-id')
      expect(url).to include('response_type=code')
    end
  end
end

# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Oauth::GithubProvider, type: :service do
  let(:connector) { instance_double('OrganizationConnector', access_token: 'gho_test123') }
  let(:provider) { described_class.new(connector) }

  describe '#test_connection' do
    context 'when the token is valid' do
      it 'returns success with account and name' do
        stub_request(:get, 'https://api.github.com/user')
          .with(headers: { 'Authorization' => 'Bearer gho_test123' })
          .to_return(
            status: 200,
            body: { login: 'octocat', name: 'The Octocat' }.to_json,
            headers: { 'Content-Type' => 'application/json' }
          )

        result = provider.test_connection

        expect(result[:success]).to be true
        expect(result[:account]).to eq('octocat')
        expect(result[:name]).to eq('The Octocat')
      end
    end

    context 'when the token is invalid' do
      it 'returns failure with error message' do
        stub_request(:get, 'https://api.github.com/user')
          .to_return(status: 401, body: '{"message":"Bad credentials"}')

        result = provider.test_connection

        expect(result[:success]).to be false
        expect(result[:error]).to include('401')
      end
    end

    context 'when a network error occurs' do
      it 'returns failure with connection error message' do
        stub_request(:get, 'https://api.github.com/user')
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
        repos = [
          {
            id: 1,
            name: 'hello-world',
            full_name: 'octocat/hello-world',
            description: 'A test repo',
            default_branch: 'main',
            clone_url: 'https://github.com/octocat/hello-world.git',
            html_url: 'https://github.com/octocat/hello-world',
            private: false
          }
        ]

        stub_request(:get, 'https://api.github.com/user/repos')
          .with(query: hash_including('page' => '1', 'per_page' => '100', 'sort' => 'updated'))
          .to_return(
            status: 200,
            body: repos.to_json,
            headers: { 'Content-Type' => 'application/json' }
          )

        result = provider.fetch_repositories

        expect(result.length).to eq(1)
        expect(result.first[:external_id]).to eq('1')
        expect(result.first[:name]).to eq('hello-world')
        expect(result.first[:full_name]).to eq('octocat/hello-world')
        expect(result.first[:is_private]).to be false
      end
    end

    context 'when the request fails' do
      it 'returns an empty array' do
        stub_request(:get, 'https://api.github.com/user/repos')
          .with(query: hash_including('page' => '1', 'per_page' => '100', 'sort' => 'updated'))
          .to_return(status: 401, body: '{}')

        expect(provider.fetch_repositories).to eq([])
      end
    end
  end

  describe '.fetch_account_info' do
    context 'when the request succeeds' do
      it 'returns account_id and account_name' do
        stub_request(:get, 'https://api.github.com/user')
          .to_return(
            status: 200,
            body: { id: 42, login: 'octocat' }.to_json,
            headers: { 'Content-Type' => 'application/json' }
          )

        result = described_class.fetch_account_info('gho_test123')

        expect(result[:account_id]).to eq('42')
        expect(result[:account_name]).to eq('octocat')
      end
    end

    context 'when the request fails' do
      it 'returns an empty hash' do
        stub_request(:get, 'https://api.github.com/user')
          .to_return(status: 401, body: '{}')

        expect(described_class.fetch_account_info('bad-token')).to eq({})
      end
    end
  end

  describe '.authorization_url' do
    before do
      allow(described_class).to receive(:client_id).and_return('gh-client-id')
    end

    it 'builds a URL pointing to GitHub authorize endpoint' do
      url = described_class.authorization_url(
        organization_id: 'org-1',
        redirect_uri: 'http://localhost:5173/integrations/callback'
      )

      expect(url).to start_with('https://github.com/login/oauth/authorize')
      expect(url).to include('client_id=gh-client-id')
      expect(url).to include('response_type=code')
    end

    it 'includes the organization ID in the state param' do
      url = described_class.authorization_url(
        organization_id: 'org-1',
        redirect_uri: 'http://localhost:5173/integrations/callback'
      )

      expect(url).to include('state=org-1')
    end
  end
end

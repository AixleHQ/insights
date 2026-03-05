# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Oauth::LinearProvider, type: :service do
  let(:connector) { instance_double('OrganizationConnector', access_token: 'lin-test123') }
  let(:provider) { described_class.new(connector) }

  describe '#test_connection' do
    context 'when the token is valid' do
      it 'returns success with account email and name' do
        stub_request(:post, 'https://api.linear.app/graphql')
          .with(
            headers: { 'Authorization' => 'Bearer lin-test123' },
            body: hash_including('query' => '{ viewer { id name email } }')
          )
          .to_return(
            status: 200,
            body: { data: { viewer: { id: 'user-1', name: 'Alice', email: 'alice@example.com' } } }.to_json,
            headers: { 'Content-Type' => 'application/json' }
          )

        result = provider.test_connection

        expect(result[:success]).to be true
        expect(result[:account]).to eq('alice@example.com')
        expect(result[:name]).to eq('Alice')
      end
    end

    context 'when the GraphQL response contains errors' do
      it 'returns failure with the error message' do
        stub_request(:post, 'https://api.linear.app/graphql')
          .to_return(
            status: 200,
            body: { data: nil, errors: [ { message: 'Authentication required' } ] }.to_json,
            headers: { 'Content-Type' => 'application/json' }
          )

        result = provider.test_connection

        expect(result[:success]).to be false
        expect(result[:error]).to eq('Authentication required')
      end
    end

    context 'when the viewer data is missing' do
      it 'returns failure with unknown error' do
        stub_request(:post, 'https://api.linear.app/graphql')
          .to_return(
            status: 200,
            body: { data: { viewer: nil } }.to_json,
            headers: { 'Content-Type' => 'application/json' }
          )

        result = provider.test_connection

        expect(result[:success]).to be false
        expect(result[:error]).to eq('Unknown error')
      end
    end

    context 'when the API returns a non-200 status' do
      it 'returns failure with error message' do
        stub_request(:post, 'https://api.linear.app/graphql')
          .to_return(status: 401, body: '{}')

        result = provider.test_connection

        expect(result[:success]).to be false
        expect(result[:error]).to include('401')
      end
    end

    context 'when a network error occurs' do
      it 'returns failure with connection error message' do
        stub_request(:post, 'https://api.linear.app/graphql')
          .to_raise(Faraday::ConnectionFailed.new('connection refused'))

        result = provider.test_connection

        expect(result[:success]).to be false
        expect(result[:error]).to include('Connection error')
      end
    end
  end

  describe '#fetch_teams' do
    context 'when the request succeeds' do
      it 'returns a list of mapped teams' do
        stub_request(:post, 'https://api.linear.app/graphql')
          .to_return(
            status: 200,
            body: {
              data: {
                teams: {
                  nodes: [
                    { id: 'team-1', name: 'Engineering', key: 'ENG' },
                    { id: 'team-2', name: 'Design', key: 'DES' }
                  ]
                }
              }
            }.to_json,
            headers: { 'Content-Type' => 'application/json' }
          )

        result = provider.fetch_teams

        expect(result.length).to eq(2)
        expect(result.first[:external_id]).to eq('team-1')
        expect(result.first[:name]).to eq('Engineering')
        expect(result.first[:key]).to eq('ENG')
      end
    end

    context 'when the request fails' do
      it 'returns an empty array' do
        stub_request(:post, 'https://api.linear.app/graphql')
          .to_return(status: 401, body: '{}')

        expect(provider.fetch_teams).to eq([])
      end
    end

    context 'when the response has no teams data' do
      it 'returns an empty array' do
        stub_request(:post, 'https://api.linear.app/graphql')
          .to_return(
            status: 200,
            body: { data: {} }.to_json,
            headers: { 'Content-Type' => 'application/json' }
          )

        expect(provider.fetch_teams).to eq([])
      end
    end
  end

  describe '#fetch_projects' do
    context 'when the request succeeds' do
      it 'returns a list of mapped projects with teams' do
        stub_request(:post, 'https://api.linear.app/graphql')
          .to_return(
            status: 200,
            body: {
              data: {
                projects: {
                  nodes: [
                    {
                      id: 'proj-1',
                      name: 'Platform',
                      state: 'started',
                      teams: { nodes: [ { id: 'team-1', name: 'Engineering' } ] }
                    }
                  ]
                }
              }
            }.to_json,
            headers: { 'Content-Type' => 'application/json' }
          )

        result = provider.fetch_projects

        expect(result.length).to eq(1)
        expect(result.first[:external_id]).to eq('proj-1')
        expect(result.first[:name]).to eq('Platform')
        expect(result.first[:state]).to eq('started')
        expect(result.first[:teams]).to eq([ { 'id' => 'team-1', 'name' => 'Engineering' } ])
      end
    end

    context 'when the request fails' do
      it 'returns an empty array' do
        stub_request(:post, 'https://api.linear.app/graphql')
          .to_return(status: 401, body: '{}')

        expect(provider.fetch_projects).to eq([])
      end
    end
  end

  describe '.fetch_account_info' do
    context 'when the request succeeds' do
      it 'returns account_id and account_name' do
        stub_request(:post, 'https://api.linear.app/graphql')
          .to_return(
            status: 200,
            body: { data: { viewer: { id: 'user-1', email: 'alice@example.com', name: 'Alice' } } }.to_json,
            headers: { 'Content-Type' => 'application/json' }
          )

        result = described_class.fetch_account_info('lin-test123')

        expect(result[:account_id]).to eq('user-1')
        expect(result[:account_name]).to eq('alice@example.com')
      end
    end

    context 'when the viewer is nil' do
      it 'returns an empty hash' do
        stub_request(:post, 'https://api.linear.app/graphql')
          .to_return(
            status: 200,
            body: { data: { viewer: nil } }.to_json,
            headers: { 'Content-Type' => 'application/json' }
          )

        expect(described_class.fetch_account_info('lin-test123')).to eq({})
      end
    end

    context 'when the request fails' do
      it 'returns an empty hash' do
        stub_request(:post, 'https://api.linear.app/graphql')
          .to_return(status: 401, body: '{}')

        expect(described_class.fetch_account_info('bad-token')).to eq({})
      end
    end
  end

  describe '.authorization_url' do
    before do
      allow(described_class).to receive(:client_id).and_return('linear-client-id')
    end

    it 'builds a URL pointing to Linear authorize endpoint' do
      url = described_class.authorization_url(
        organization_id: 'org-1',
        redirect_uri: 'http://localhost:5173/integrations/callback'
      )

      expect(url).to start_with('https://linear.app/oauth/authorize')
      expect(url).to include('client_id=linear-client-id')
      expect(url).to include('response_type=code')
    end
  end
end

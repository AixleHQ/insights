# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Oauth::BitbucketProvider, type: :service do
  let(:connector) { instance_double('OrganizationConnector', access_token: 'bb-test123') }
  let(:provider) { described_class.new(connector) }

  describe '#test_connection' do
    context 'when the token is valid' do
      it 'returns success with account and display name' do
        stub_request(:get, 'https://api.bitbucket.org/2.0/user')
          .with(headers: { 'Authorization' => 'Bearer bb-test123' })
          .to_return(
            status: 200,
            body: { username: 'bbuser', display_name: 'BB User' }.to_json,
            headers: { 'Content-Type' => 'application/json' }
          )

        result = provider.test_connection

        expect(result[:success]).to be true
        expect(result[:account]).to eq('bbuser')
        expect(result[:name]).to eq('BB User')
      end
    end

    context 'when the token is invalid' do
      it 'returns failure with error message' do
        stub_request(:get, 'https://api.bitbucket.org/2.0/user')
          .to_return(status: 401, body: '{"error":{"message":"Unauthorized"}}')

        result = provider.test_connection

        expect(result[:success]).to be false
        expect(result[:error]).to include('401')
      end
    end

    context 'when a network error occurs' do
      it 'returns failure with connection error message' do
        stub_request(:get, 'https://api.bitbucket.org/2.0/user')
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
        repos = {
          values: [
            {
              uuid: '{repo-uuid}',
              name: 'bb-repo',
              full_name: 'bbuser/bb-repo',
              description: 'A Bitbucket repo',
              mainbranch: { name: 'main' },
              links: {
                clone: [ { name: 'https', href: 'https://bbuser@bitbucket.org/bbuser/bb-repo.git' } ],
                html: { href: 'https://bitbucket.org/bbuser/bb-repo' }
              },
              is_private: true
            }
          ]
        }

        stub_request(:get, 'https://api.bitbucket.org/2.0/repositories')
          .with(query: hash_including('page' => '1', 'pagelen' => '100', 'role' => 'member'))
          .to_return(
            status: 200,
            body: repos.to_json,
            headers: { 'Content-Type' => 'application/json' }
          )

        result = provider.fetch_repositories

        expect(result.length).to eq(1)
        expect(result.first[:external_id]).to eq('{repo-uuid}')
        expect(result.first[:name]).to eq('bb-repo')
        expect(result.first[:default_branch]).to eq('main')
        expect(result.first[:is_private]).to be true
      end

      it 'falls back to "main" when mainbranch is absent' do
        repos = {
          values: [
            {
              uuid: '{repo-uuid}',
              name: 'bb-repo',
              full_name: 'bbuser/bb-repo',
              description: nil,
              links: { clone: [], html: { href: 'https://bitbucket.org/bbuser/bb-repo' } },
              is_private: false
            }
          ]
        }

        stub_request(:get, 'https://api.bitbucket.org/2.0/repositories')
          .with(query: hash_including('page' => '1', 'pagelen' => '100', 'role' => 'member'))
          .to_return(
            status: 200,
            body: repos.to_json,
            headers: { 'Content-Type' => 'application/json' }
          )

        result = provider.fetch_repositories
        expect(result.first[:default_branch]).to eq('main')
      end
    end

    context 'when the request fails' do
      it 'returns an empty array' do
        stub_request(:get, 'https://api.bitbucket.org/2.0/repositories')
          .with(query: hash_including('page' => '1', 'pagelen' => '100', 'role' => 'member'))
          .to_return(status: 401, body: '{}')

        expect(provider.fetch_repositories).to eq([])
      end
    end
  end

  describe '.fetch_account_info' do
    context 'when the request succeeds' do
      it 'returns account_id and account_name' do
        stub_request(:get, 'https://api.bitbucket.org/2.0/user')
          .to_return(
            status: 200,
            body: { uuid: '{user-uuid}', username: 'bbuser' }.to_json,
            headers: { 'Content-Type' => 'application/json' }
          )

        result = described_class.fetch_account_info('bb-test123')

        expect(result[:account_id]).to eq('{user-uuid}')
        expect(result[:account_name]).to eq('bbuser')
      end
    end

    context 'when the request fails' do
      it 'returns an empty hash' do
        stub_request(:get, 'https://api.bitbucket.org/2.0/user')
          .to_return(status: 401, body: '{}')

        expect(described_class.fetch_account_info('bad-token')).to eq({})
      end
    end
  end
end

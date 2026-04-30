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
      it 'returns a list of mapped repositories across accessible workspaces' do
        workspaces = {
          values: [
            { workspace: { slug: 'bbworkspace' } }
          ]
        }
        repos = {
          values: [
            {
              uuid: '{repo-uuid}',
              name: 'bb-repo',
              full_name: 'bbworkspace/bb-repo',
              description: 'A Bitbucket repo',
              mainbranch: { name: 'main' },
              links: {
                clone: [ { name: 'https', href: 'https://bbuser@bitbucket.org/bbworkspace/bb-repo.git' } ],
                html: { href: 'https://bitbucket.org/bbworkspace/bb-repo' }
              },
              is_private: true
            }
          ]
        }

        stub_request(:get, 'https://api.bitbucket.org/2.0/user/workspaces')
          .with(query: hash_including('page' => '1', 'pagelen' => '100'))
          .to_return(
            status: 200,
            body: workspaces.to_json,
            headers: { 'Content-Type' => 'application/json' }
          )

        stub_request(:get, 'https://api.bitbucket.org/2.0/repositories/bbworkspace')
          .with(query: hash_including('page' => '1', 'pagelen' => '100'))
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
        workspaces = {
          values: [
            { workspace: { slug: 'bbworkspace' } }
          ]
        }
        repos = {
          values: [
            {
              uuid: '{repo-uuid}',
              name: 'bb-repo',
              full_name: 'bbworkspace/bb-repo',
              description: nil,
              links: { clone: [], html: { href: 'https://bitbucket.org/bbworkspace/bb-repo' } },
              is_private: false
            }
          ]
        }

        stub_request(:get, 'https://api.bitbucket.org/2.0/user/workspaces')
          .with(query: hash_including('page' => '1', 'pagelen' => '100'))
          .to_return(
            status: 200,
            body: workspaces.to_json,
            headers: { 'Content-Type' => 'application/json' }
          )

        stub_request(:get, 'https://api.bitbucket.org/2.0/repositories/bbworkspace')
          .with(query: hash_including('page' => '1', 'pagelen' => '100'))
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
        stub_request(:get, 'https://api.bitbucket.org/2.0/user/workspaces')
          .with(query: hash_including('page' => '1', 'pagelen' => '100'))
          .to_return(status: 401, body: '{}')

        expect(provider.fetch_repositories).to eq([])
      end
    end
  end

  describe '#fetch_pull_requests' do
    it 'returns mapped pull requests updated after the requested time' do
      pull_requests = {
        values: [
          {
            id: 17,
            title: 'Improve CI visibility',
            state: 'MERGED',
            updated_on: '2026-04-29T11:21:47Z',
            links: { html: { href: 'https://bitbucket.org/ws/repo/pull-requests/17' } },
            author: { nickname: 'bbuser' }
          }
        ]
      }

      stub_request(:get, 'https://api.bitbucket.org/2.0/repositories/ws/repo/pullrequests')
        .with(query: hash_including('page' => '1', 'pagelen' => '100'))
        .to_return(
          status: 200,
          body: pull_requests.to_json,
          headers: { 'Content-Type' => 'application/json' }
        )

      result = provider.fetch_pull_requests('ws', 'repo', updated_after: Time.zone.parse('2026-04-01T00:00:00Z'))

      expect(result).to eq([
        {
          id: 17,
          title: 'Improve CI visibility',
          state: 'MERGED',
          updated_at: '2026-04-29T11:21:47Z',
          web_url: 'https://bitbucket.org/ws/repo/pull-requests/17',
          author_username: 'bbuser'
        }
      ])
    end
  end

  describe '#fetch_pipelines' do
    it 'returns mapped pipelines' do
      pipelines = {
        values: [
          {
            uuid: '{pipeline-uuid}',
            created_on: '2026-04-29T11:20:00Z',
            completed_on: '2026-04-29T11:22:00Z',
            state: { name: 'COMPLETED' },
            target: { ref_name: 'main', commit: { hash: 'abc123' } },
            links: { html: { href: 'https://bitbucket.org/ws/repo/pipelines/results/12' } }
          }
        ]
      }

      stub_request(:get, 'https://api.bitbucket.org/2.0/repositories/ws/repo/pipelines')
        .with(query: hash_including('page' => '1', 'pagelen' => '100'))
        .to_return(
          status: 200,
          body: pipelines.to_json,
          headers: { 'Content-Type' => 'application/json' }
        )

      result = provider.fetch_pipelines('ws', 'repo', updated_after: Time.zone.parse('2026-04-01T00:00:00Z'))

      expect(result).to eq([
        {
          id: '{pipeline-uuid}',
          status: 'COMPLETED',
          ref: 'main',
          updated_at: '2026-04-29T11:22:00Z',
          web_url: 'https://bitbucket.org/ws/repo/pipelines/results/12',
          sha: 'abc123'
        }
      ])
    end
  end

  describe '#fetch_commits' do
    it 'returns mapped commits since the requested time' do
      commits = {
        values: [
          {
            hash: 'abc123',
            date: '2026-04-29T11:21:47Z',
            message: 'Ship analytics',
            author: {
              raw: 'BB User <bb@example.com>',
              user: { display_name: 'BB User' }
            },
            links: { html: { href: 'https://bitbucket.org/ws/repo/commits/abc123' } }
          },
          {
            hash: 'old111',
            date: '2026-03-01T10:00:00Z',
            message: 'Old commit',
            author: { raw: 'BB User <bb@example.com>' },
            links: { html: { href: 'https://bitbucket.org/ws/repo/commits/old111' } }
          }
        ]
      }

      stub_request(:get, 'https://api.bitbucket.org/2.0/repositories/ws/repo/commits/main')
        .with(query: hash_including('page' => '1', 'pagelen' => '100', 'include' => 'main'))
        .to_return(
          status: 200,
          body: commits.to_json,
          headers: { 'Content-Type' => 'application/json' }
        )

      result = provider.fetch_commits('ws', 'repo', branch: 'main', since: Time.zone.parse('2026-04-01T00:00:00Z'))

      expect(result).to eq([
        {
          "id" => 'abc123',
          "message" => 'Ship analytics',
          "timestamp" => '2026-04-29T11:21:47Z',
          "url" => 'https://bitbucket.org/ws/repo/commits/abc123',
          "author" => {
            "name" => 'BB User',
            "email" => 'bb@example.com'
          }
        }
      ])
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

  describe '.authorization_url' do
    before do
      allow(described_class).to receive(:client_id).and_return('bb-client-id')
    end

    it 'builds a Bitbucket authorize URL without a scope query param' do
      url = described_class.authorization_url(
        organization_id: 'org-1',
        redirect_uri: 'http://localhost:5173/integrations/callback'
      )

      expect(url).to start_with('https://bitbucket.org/site/oauth2/authorize')
      expect(url).to include('client_id=bb-client-id')
      expect(url).to include('response_type=code')
      expect(url).not_to include('scope=')
    end
  end

  describe '.scopes' do
    it 'includes repository, pull request, and pipeline scopes' do
      expect(described_class.scopes).to eq(%w[account repository pullrequest pipeline])
    end
  end
end

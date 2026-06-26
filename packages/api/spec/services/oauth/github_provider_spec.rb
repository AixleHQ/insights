# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Oauth::GithubProvider, type: :service do
  let(:connector) do
    instance_double(
      'OrganizationConnector',
      access_token: 'gho_test123',
      token_expired?: false,
      refresh_token: nil
    )
  end
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

    context 'when the token is expired but can be refreshed' do
      let(:connector) do
        instance_double(
          'OrganizationConnector',
          access_token: 'gho_new456',
          token_expired?: true,
          refresh_token: 'ghr_refresh',
          mark_error!: nil
        )
      end

      it 'refreshes the token and returns success' do
        allow(provider).to receive(:refresh_token!).and_return(true)
        allow(provider).to receive(:reset_http_client!).and_call_original

        stub_request(:get, 'https://api.github.com/user')
          .with(headers: { 'Authorization' => 'Bearer gho_new456' })
          .to_return(
            status: 200,
            body: { login: 'octocat', name: 'The Octocat' }.to_json,
            headers: { 'Content-Type' => 'application/json' }
          )

        result = provider.test_connection

        expect(result[:success]).to be true
        expect(result[:account]).to eq('octocat')
      end
    end

    context 'when the token is expired and cannot be refreshed' do
      let(:connector) do
        instance_double(
          'OrganizationConnector',
          access_token: 'gho_expired',
          token_expired?: true,
          refresh_token: nil,
          mark_error!: nil
        )
      end

      it 'raises TokenRefreshError which bubbles up as a connection error' do
        expect { provider.test_connection }.to raise_error(Oauth::TokenRefreshError)
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

    context 'when the token is expired but can be refreshed' do
      let(:connector) do
        instance_double(
          'OrganizationConnector',
          access_token: 'gho_new456',
          token_expired?: true,
          refresh_token: 'ghr_refresh',
          mark_error!: nil
        )
      end

      it 'refreshes the token and returns repositories' do
        allow(provider).to receive(:refresh_token!).and_return(true)
        allow(provider).to receive(:reset_http_client!).and_call_original

        stub_request(:get, 'https://api.github.com/user/repos')
          .with(query: hash_including('page' => '1', 'per_page' => '100', 'sort' => 'updated'))
          .to_return(
            status: 200,
            body: [ { id: 1, name: 'repo', full_name: 'org/repo', description: nil,
                      default_branch: 'main', clone_url: 'https://github.com/org/repo.git',
                      html_url: 'https://github.com/org/repo', private: false } ].to_json,
            headers: { 'Content-Type' => 'application/json' }
          )

        result = provider.fetch_repositories

        expect(result.length).to eq(1)
        expect(result.first[:name]).to eq('repo')
      end
    end
  end

  describe '#fetch_commits' do
    let(:since_time) { 2.days.ago }

    it 'returns commits normalized like webhook push payloads' do
      stub_request(:get, 'https://api.github.com/repos/octocat/hello-world/commits')
        .with(
          headers: { 'Authorization' => 'Bearer gho_test123' },
          query: hash_including('per_page' => '100', 'page' => '1', 'sha' => 'main')
        )
        .to_return(
          status: 200,
          body: [ {
            sha: 'abc123',
            html_url: 'https://github.com/octocat/hello-world/commit/abc123',
            commit: {
              message: 'Fix bug',
              author: { name: 'Octocat', email: 'octocat@github.com', date: '2024-06-01T12:00:00Z' }
            }
          } ].to_json,
          headers: { 'Content-Type' => 'application/json' }
        )

      result = provider.fetch_commits('octocat/hello-world', branch: 'main', since: since_time)

      expect(result.size).to eq(1)
      commit = result.first
      expect(commit['id']).to eq('abc123')
      expect(commit['message']).to eq('Fix bug')
      expect(commit['timestamp']).to eq('2024-06-01T12:00:00Z')
      expect(commit.dig('author', 'email')).to eq('octocat@github.com')
      expect(commit['url']).to eq('https://github.com/octocat/hello-world/commit/abc123')
    end

    it 'returns an empty array when full_name is invalid' do
      expect(provider.fetch_commits('', branch: 'main', since: since_time)).to eq([])
    end

    it 'returns an empty array when the request fails' do
      stub_request(:get, %r{\Ahttps://api\.github\.com/repos/octocat/hello-world/commits})
        .to_return(status: 404, body: '{}')

      expect(provider.fetch_commits('octocat/hello-world', branch: 'main', since: since_time)).to eq([])
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

  describe '#fetch_pull_requests_for_commit' do
    let(:sha) { 'abc123def456' }

    context 'when the commit has associated pull requests' do
      it 'returns the parsed array' do
        stub_request(:get, "https://api.github.com/repos/octocat/hello-world/commits/#{sha}/pulls")
          .with(headers: { 'Authorization' => 'Bearer gho_test123' })
          .to_return(
            status: 200,
            body: [ { number: 42, html_url: 'https://github.com/octocat/hello-world/pull/42', state: 'open' } ].to_json,
            headers: { 'Content-Type' => 'application/json' }
          )

        result = provider.fetch_pull_requests_for_commit('octocat/hello-world', sha)

        expect(result.size).to eq(1)
        expect(result.first['number']).to eq(42)
        expect(result.first['html_url']).to eq('https://github.com/octocat/hello-world/pull/42')
        expect(result.first['state']).to eq('open')
      end
    end

    context 'when the commit has no pull requests' do
      it 'returns an empty array' do
        stub_request(:get, "https://api.github.com/repos/octocat/hello-world/commits/#{sha}/pulls")
          .to_return(status: 200, body: '[]', headers: { 'Content-Type' => 'application/json' })

        expect(provider.fetch_pull_requests_for_commit('octocat/hello-world', sha)).to eq([])
      end
    end

    context 'when the API responds with an error' do
      it 'raises Oauth::GithubApiError so callers can retry' do
        stub_request(:get, "https://api.github.com/repos/octocat/hello-world/commits/#{sha}/pulls")
          .to_return(status: 502, body: '{"message":"Bad gateway"}')

        expect {
          provider.fetch_pull_requests_for_commit('octocat/hello-world', sha)
        }.to raise_error(Oauth::GithubApiError, /502/)
      end
    end

    context 'with a malformed full_name' do
      it 'raises ArgumentError without an HTTP call' do
        expect {
          provider.fetch_pull_requests_for_commit('no-slash', sha)
        }.to raise_error(ArgumentError)
      end
    end

    context 'with a malformed commit sha' do
      it 'raises ArgumentError without an HTTP call' do
        expect {
          provider.fetch_pull_requests_for_commit('octocat/hello-world', 'abc/../evil')
        }.to raise_error(ArgumentError)
      end
    end

    context 'when the API returns a non-array 200 body' do
      it 'raises Oauth::GithubApiError' do
        stub_request(:get, "https://api.github.com/repos/octocat/hello-world/commits/#{sha}/pulls")
          .to_return(status: 200, body: '{"message":"ok"}', headers: { 'Content-Type' => 'application/json' })

        expect {
          provider.fetch_pull_requests_for_commit('octocat/hello-world', sha)
        }.to raise_error(Oauth::GithubApiError, /non-array/)
      end
    end

    context 'when the API returns an unparseable 200 body' do
      it 'raises Oauth::GithubApiError' do
        stub_request(:get, "https://api.github.com/repos/octocat/hello-world/commits/#{sha}/pulls")
          .to_return(status: 200, body: '<html>oops</html>', headers: { 'Content-Type' => 'text/html' })

        expect {
          provider.fetch_pull_requests_for_commit('octocat/hello-world', sha)
        }.to raise_error(Oauth::GithubApiError, /unparseable/)
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

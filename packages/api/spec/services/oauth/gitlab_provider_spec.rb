# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Oauth::GitlabProvider, type: :service do
  let(:connector) do
    instance_double(
      'OrganizationConnector',
      access_token: 'glpat-test123',
      refresh_token: 'glrt-refresh123',
      token_expired?: false
    )
  end
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

    context 'when the token is expired and refresh succeeds' do
      before do
        allow(connector).to receive(:token_expired?).and_return(true)
        allow(connector).to receive(:update!) do
          allow(connector).to receive(:access_token).and_return('new-token')
        end
        allow(described_class).to receive(:client_id).and_return('client-id')
        allow(described_class).to receive(:client_secret).and_return('client-secret')

        stub_request(:post, 'https://gitlab.com/oauth/token')
          .to_return(
            status: 200,
            body: { access_token: 'new-token', refresh_token: 'new-refresh', expires_in: 3600 }.to_json,
            headers: { 'Content-Type' => 'application/json' }
          )
        stub_request(:get, 'https://gitlab.com/api/v4/user')
          .with(headers: { 'Authorization' => 'Bearer new-token' })
          .to_return(
            status: 200,
            body: { username: 'gitlabuser', name: 'GitLab User' }.to_json,
            headers: { 'Content-Type' => 'application/json' }
          )
      end

      it 'refreshes the token and succeeds' do
        result = provider.test_connection

        expect(result[:success]).to be true
        expect(connector).to have_received(:update!)
      end
    end

    context 'when the token is expired and refresh fails' do
      before do
        allow(connector).to receive(:token_expired?).and_return(true)
        allow(connector).to receive(:refresh_token).and_return(nil)
        allow(connector).to receive(:mark_error!)
      end

      it 'raises TokenRefreshError' do
        expect { provider.test_connection }.to raise_error(Oauth::TokenRefreshError)
      end

      it 'marks the connector as error' do
        provider.test_connection
      rescue Oauth::TokenRefreshError
        expect(connector).to have_received(:mark_error!)
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

      it 'with all_pages: true, follows X-Next-Page and merges all projects' do
        project_row = lambda do |id, name|
          {
            id: id,
            name: name,
            path_with_namespace: "group/#{name}",
            description: 'desc',
            default_branch: 'main',
            http_url_to_repo: "https://gitlab.com/group/#{name}.git",
            web_url: "https://gitlab.com/group/#{name}",
            visibility: 'private'
          }
        end

        stub_request(:get, 'https://gitlab.com/api/v4/projects')
          .with(query: hash_including('page' => '1'))
          .to_return(
            status: 200,
            body: [ project_row.call(1, 'one') ].to_json,
            headers: { 'Content-Type' => 'application/json', 'X-Next-Page' => '2' }
          )
        stub_request(:get, 'https://gitlab.com/api/v4/projects')
          .with(query: hash_including('page' => '2'))
          .to_return(
            status: 200,
            body: [ project_row.call(2, 'two') ].to_json,
            headers: { 'Content-Type' => 'application/json' }
          )

        result = provider.fetch_repositories(all_pages: true)

        expect(result.map { |r| r[:external_id] }).to eq(%w[1 2])
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

  describe '#fetch_merge_requests' do
    let(:updated_after) { Time.zone.parse('2025-04-01 12:00:00 UTC') }
    let(:base_mr) do
      {
        iid: 1,
        title: 'MR',
        state: 'opened',
        updated_at: '2025-04-02T10:00:00Z',
        web_url: 'https://gitlab.com/g/p/-/merge_requests/1',
        author: { username: 'alice' }
      }
    end

    it 'follows X-Next-Page until exhausted and concatenates results' do
      stub_request(:get, 'https://gitlab.com/api/v4/projects/99/merge_requests')
        .with(query: hash_including('page' => '1'))
        .to_return(
          status: 200,
          body: [ base_mr.merge(iid: 1) ].to_json,
          headers: { 'Content-Type' => 'application/json', 'X-Next-Page' => '2' }
        )
      stub_request(:get, 'https://gitlab.com/api/v4/projects/99/merge_requests')
        .with(query: hash_including('page' => '2'))
        .to_return(
          status: 200,
          body: [ base_mr.merge(iid: 2, title: 'Second') ].to_json,
          headers: { 'Content-Type' => 'application/json' }
        )

      result = provider.fetch_merge_requests('99', updated_after: updated_after)

      expect(result.map { |r| r[:iid] }).to eq([ 1, 2 ])
      expect(result.last[:title]).to eq('Second')
    end

    it 'returns [] when the first page fails' do
      stub_request(:get, 'https://gitlab.com/api/v4/projects/99/merge_requests')
        .with(query: hash_including('page' => '1'))
        .to_return(status: 401, body: '{}')

      expect(provider.fetch_merge_requests('99', updated_after: updated_after)).to eq([])
    end
  end

  describe '#fetch_pipelines' do
    let(:updated_after) { Time.zone.parse('2025-04-01 12:00:00 UTC') }
    let(:base_pipeline) do
      {
        id: 10,
        status: 'success',
        ref: 'main',
        updated_at: '2025-04-02T10:00:00Z',
        web_url: 'https://gitlab.com/g/p/-/pipelines/10',
        sha: 'abc'
      }
    end

    it 'paginates across multiple pages' do
      stub_request(:get, 'https://gitlab.com/api/v4/projects/7/pipelines')
        .with(query: hash_including('page' => '1'))
        .to_return(
          status: 200,
          body: [ base_pipeline.merge(id: 1) ].to_json,
          headers: { 'Content-Type' => 'application/json', 'X-Next-Page' => '2' }
        )
      stub_request(:get, 'https://gitlab.com/api/v4/projects/7/pipelines')
        .with(query: hash_including('page' => '2'))
        .to_return(
          status: 200,
          body: [ base_pipeline.merge(id: 2) ].to_json,
          headers: { 'Content-Type' => 'application/json' }
        )

      ids = provider.fetch_pipelines('7', updated_after: updated_after).map { |p| p[:id] }

      expect(ids).to eq([ 1, 2 ])
    end
  end

  describe '#fetch_commits' do
    let(:since) { Time.zone.parse('2025-04-01 12:00:00 UTC') }
    let(:base_commit) do
      {
        id: 'deadbeef',
        message: 'msg',
        committed_date: '2025-04-02T10:00:00Z',
        web_url: 'https://gitlab.com/g/p/-/commit/deadbeef',
        author_name: 'Bob',
        author_email: 'bob@example.com'
      }
    end

    it 'paginates across multiple pages' do
      stub_request(:get, 'https://gitlab.com/api/v4/projects/5/repository/commits')
        .with(query: hash_including('page' => '1', 'ref_name' => 'main'))
        .to_return(
          status: 200,
          body: [ base_commit.merge(id: 'aaa') ].to_json,
          headers: { 'Content-Type' => 'application/json', 'X-Next-Page' => '2' }
        )
      stub_request(:get, 'https://gitlab.com/api/v4/projects/5/repository/commits')
        .with(query: hash_including('page' => '2', 'ref_name' => 'main'))
        .to_return(
          status: 200,
          body: [ base_commit.merge(id: 'bbb') ].to_json,
          headers: { 'Content-Type' => 'application/json' }
        )

      ids = provider.fetch_commits('5', ref_name: 'main', since: since).map { |c| c['id'] }

      expect(ids).to eq(%w[aaa bbb])
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

  describe 'rate-limit retry (429)' do
    let(:since) { Time.zone.parse('2025-04-01 12:00:00 UTC') }

    it 'retries on 429 and succeeds on the next attempt' do
      commit_body = [ {
        id: 'abc', message: 'msg', committed_date: '2025-04-02T10:00:00Z',
        web_url: 'https://gitlab.com/g/p/-/commit/abc',
        author_name: 'Bob', author_email: 'bob@example.com'
      } ].to_json

      stub_request(:get, 'https://gitlab.com/api/v4/projects/5/repository/commits')
        .with(query: hash_including('page' => '1'))
        .to_return(
          { status: 429, body: '{}', headers: { 'Retry-After' => '0' } },
          { status: 200, body: commit_body, headers: { 'Content-Type' => 'application/json' } }
        )

      result = provider.fetch_commits('5', ref_name: 'main', since: since)
      expect(result.first['id']).to eq('abc')
    end

    it 'returns the 429 response after exhausting all retry attempts' do
      stub_request(:get, 'https://gitlab.com/api/v4/projects/5/repository/commits')
        .with(query: hash_including('page' => '1'))
        .to_return(status: 429, body: '{}', headers: { 'Retry-After' => '0' })

      # 1 initial + RETRY_MAX_ATTEMPTS retries, all 429 → gitlab_json_pages returns []
      result = provider.fetch_commits('5', ref_name: 'main', since: since)
      expect(result).to eq([])
    end
  end

  describe 'GITLAB_MAX_PAGES page cap' do
    let(:updated_after) { Time.zone.parse('2025-04-01 12:00:00 UTC') }

    it 'stops paginating after GITLAB_MAX_PAGES pages' do
      allow(ENV).to receive(:fetch).and_call_original
      allow(ENV).to receive(:fetch).with('GITLAB_MAX_PAGES', anything).and_return('1')
      allow(ENV).to receive(:fetch).with('GITLAB_PAGE_DELAY_MS', anything).and_return('0')

      stub_request(:get, 'https://gitlab.com/api/v4/projects/99/merge_requests')
        .with(query: hash_including('page' => '1'))
        .to_return(
          status: 200,
          body: [ { iid: 1, title: 'MR', state: 'opened', updated_at: '2025-04-02T10:00:00Z',
                   web_url: 'https://x', author: { username: 'a' } } ].to_json,
          headers: { 'Content-Type' => 'application/json', 'X-Next-Page' => '2' }
        )
      # Page 2 stub — should never be requested when cap=1
      stub_request(:get, 'https://gitlab.com/api/v4/projects/99/merge_requests')
        .with(query: hash_including('page' => '2'))
        .to_return(status: 200, body: [].to_json, headers: { 'Content-Type' => 'application/json' })

      result = provider.fetch_merge_requests('99', updated_after: updated_after)
      expect(result.size).to eq(1)
      expect(a_request(:get, 'https://gitlab.com/api/v4/projects/99/merge_requests')
        .with(query: hash_including('page' => '2'))).not_to have_been_made
    end
  end
end

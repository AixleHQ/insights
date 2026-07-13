# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Api::V1::ProjectLookup', type: :request do
  let(:organization) { create(:organization) }
  let(:user) { create(:user) }
  let!(:membership) { create(:organization_membership, user: user, organization: organization) }
  let!(:tool_account) { create(:user_tool_account, organization_membership: membership, tool_name: 'cursor') }
  let(:raw_token) { tool_account.plaintext_token }

  # raw_url ends in .git; after normalization both sides match
  let(:raw_url) { 'git@github.com:org/my-repo.git' }
  let(:normalized_url) { Project.normalize_git_remote(raw_url) }

  let!(:matched_project) do
    create(:project, organization: organization, owner: nil,
           git_remote_url: normalized_url)
  end

  def lookup_get(git_remote:, token: raw_token)
    headers = {}
    headers['Authorization'] = "Bearer #{token}" if token
    get '/api/v1/projects/lookup', params: { git_remote: git_remote }, headers: headers
  end

  describe 'GET /api/v1/projects/lookup' do
    context 'with a matching org project' do
      it 'returns 200 with project_id and name' do
        lookup_get(git_remote: raw_url)
        expect(response).to have_http_status(:ok)
        expect(json_data[:project_id]).to eq(matched_project.id)
        expect(json_data[:name]).to eq(matched_project.name)
      end
    end

    context 'when project was registered with HTTPS and lookup uses SSH' do
      let!(:https_registered_project) do
        create(:project, organization: organization, owner: nil,
               git_remote_url: 'https://github.com/cross/format-repo')
      end

      it 'returns 200 matching SSH query to HTTPS stored URL' do
        lookup_get(git_remote: 'git@github.com:cross/format-repo.git')
        expect(response).to have_http_status(:ok)
        expect(json_data[:project_id]).to eq(https_registered_project.id)
      end
    end

    context 'when project was registered with SSH and lookup uses HTTPS' do
      let!(:ssh_registered_project) do
        create(:project, organization: organization, owner: nil,
               git_remote_url: 'git@github.com:cross/ssh-origin-repo.git')
      end

      it 'returns 200 matching HTTPS query to persisted canonical URL from SSH registration' do
        expect(ssh_registered_project.reload.git_remote_url).to eq('https://github.com/cross/ssh-origin-repo')
        lookup_get(git_remote: 'https://github.com/cross/ssh-origin-repo.git')
        expect(response).to have_http_status(:ok)
        expect(json_data[:project_id]).to eq(ssh_registered_project.id)
      end
    end

    context 'with .git suffix difference (normalization)' do
      it 'returns 200 when stored URL has no .git but query has .git' do
        # matched_project already stored without .git (normalized).
        # Query with the raw URL containing .git — normalization should unify them.
        lookup_get(git_remote: raw_url)
        expect(response).to have_http_status(:ok)
        expect(json_data[:project_id]).to eq(matched_project.id)
      end
    end

    context 'with a matching personal project' do
      let!(:personal_project) do
        create(:project, :personal, owner: user, organization: nil,
               git_remote_url: Project.normalize_git_remote('git@github.com:user/personal.git'))
      end

      it 'returns 200' do
        lookup_get(git_remote: 'git@github.com:user/personal.git')
        expect(response).to have_http_status(:ok)
        expect(json_data[:project_id]).to eq(personal_project.id)
      end
    end

    context 'when both org and personal projects share the same git remote' do
      let(:shared_remote) { 'git@github.com:org/shared-repo.git' }
      let(:shared_normalized) { Project.normalize_git_remote(shared_remote) }
      let!(:org_project) do
        create(:project, organization: organization, owner: nil, git_remote_url: shared_normalized)
      end
      let!(:personal_project) do
        create(:project, :personal, owner: user, organization: nil, git_remote_url: shared_normalized)
      end

      it 'prefers the organization project for ingest-token lookups' do
        lookup_get(git_remote: shared_remote)
        expect(response).to have_http_status(:ok)
        expect(json_data[:project_id]).to eq(org_project.id)
        expect(json_data[:project_id]).not_to eq(personal_project.id)
      end
    end

    context 'normalization variants of the same remote' do
      # matched_project stores the canonical https://github.com/org/my-repo
      [
        'ssh://git@github.com/org/my-repo.git',
        'https://github.com/org/my-repo/',
        'https://github.com/org/my-repo.git/',
        'https://x-access-token:SECRET@github.com/org/my-repo.git'
      ].each do |variant|
        it "resolves #{variant} to the canonical project" do
          lookup_get(git_remote: variant)
          expect(response).to have_http_status(:ok)
          expect(json_data[:project_id]).to eq(matched_project.id)
        end
      end
    end

    context 'when the remote uses an SSH host alias (host differs, path matches)' do
      let!(:aliased_project) do
        create(:project, organization: organization, owner: nil,
               git_remote_url: 'https://github.com/aliased/host-repo')
      end

      it 'resolves via the host-agnostic path fallback' do
        lookup_get(git_remote: 'git@github-work:aliased/host-repo.git')
        expect(response).to have_http_status(:ok)
        expect(json_data[:project_id]).to eq(aliased_project.id)
      end

      it 'does not match a different path under the same alias host' do
        lookup_get(git_remote: 'git@github-work:aliased/other-repo.git')
        expect(response).to have_http_status(:not_found)
      end
    end

    context 'when no project matches' do
      it 'returns 404' do
        lookup_get(git_remote: 'git@github.com:org/unknown.git')
        expect(response).to have_http_status(:not_found)
      end
    end

    context 'when the matched project is inactive' do
      let!(:inactive_project) do
        create(:project, :inactive, organization: organization, owner: nil,
               git_remote_url: Project.normalize_git_remote('git@github.com:org/inactive.git'))
      end

      it 'returns 404' do
        lookup_get(git_remote: 'git@github.com:org/inactive.git')
        expect(response).to have_http_status(:not_found)
      end
    end

    context 'when git_remote param is missing' do
      it 'returns 400' do
        headers = { 'Authorization' => "Bearer #{raw_token}" }
        get '/api/v1/projects/lookup', headers: headers
        expect(response).to have_http_status(:bad_request)
      end
    end

    context 'when git_remote param is blank' do
      it 'returns 400' do
        lookup_get(git_remote: '')
        expect(response).to have_http_status(:bad_request)
      end
    end

    context 'with no Authorization header' do
      it 'returns 401' do
        lookup_get(git_remote: raw_url, token: nil)
        expect(response).to have_http_status(:unauthorized)
      end
    end

    context 'with an invalid token' do
      it 'returns 401' do
        lookup_get(git_remote: raw_url, token: 'invalid-token')
        expect(response).to have_http_status(:unauthorized)
      end
    end

    context 'when the token user is only a viewer (AIX-503)' do
      before { membership.update!(role: 'viewer') }

      it 'returns 403 and does not resolve the project' do
        lookup_get(git_remote: raw_url)
        expect(response).to have_http_status(:forbidden)
      end
    end

    context 'when project belongs to a different organization' do
      let(:other_org) { create(:organization) }
      let!(:other_project) do
        create(:project, organization: other_org, owner: nil,
               git_remote_url: Project.normalize_git_remote('git@github.com:other/repo.git'))
      end

      it 'returns 404 for cross-org project' do
        lookup_get(git_remote: 'git@github.com:other/repo.git')
        expect(response).to have_http_status(:not_found)
      end
    end
  end
end

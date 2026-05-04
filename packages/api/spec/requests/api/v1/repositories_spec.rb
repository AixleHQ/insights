# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Api::V1::Repositories', type: :request do
  let(:admin) { create(:user) }
  let(:member) { create(:user) }
  let(:organization) { create(:organization) }
  let(:project) { create(:project, organization: organization, owner: nil) }
  let(:connector) { create(:organization_connector, organization: organization, connector_type: 'github') }
  let!(:admin_org_membership) { create(:organization_membership, user: admin, organization: organization) }
  let!(:member_org_membership) { create(:organization_membership, user: member, organization: organization) }
  let!(:admin_project_membership) { create(:project_membership, user: admin, project: project, role: 'admin') }
  let!(:member_project_membership) { create(:project_membership, user: member, project: project, role: 'member') }
  let!(:repository) { create(:repository, project: project, organization_connector: connector) }

  describe 'GET /api/v1/projects/:project_id/repositories' do
    it 'returns all repositories for the project' do
      authenticated_get "/api/v1/projects/#{project.id}/repositories", user: member

      expect_success
      expect(json_data.length).to eq(1)
      expect(json_data.first[:id]).to eq(repository.id)
    end

    it 'filters by private status' do
      public_repo = create(:repository, project: project, organization_connector: connector, is_private: false)

      authenticated_get "/api/v1/projects/#{project.id}/repositories",
                        user: member,
                        params: { private: 'false' }

      expect_success
      ids = json_data.map { |r| r[:id] }
      expect(ids).to include(public_repo.id)
    end
  end

  describe 'GET /api/v1/projects/:project_id/repositories/:id' do
    it 'returns the repository' do
      authenticated_get "/api/v1/projects/#{project.id}/repositories/#{repository.id}", user: member

      expect_success
      expect(json_data[:id]).to eq(repository.id)
      expect(json_data[:provider]).to eq('github')
    end
  end

  describe 'POST /api/v1/projects/:project_id/repositories' do
    it 'creates a repository as project admin' do
      authenticated_post "/api/v1/projects/#{project.id}/repositories",
                         user: admin,
                         params: {
                           organization_connector_id: connector.id,
                           external_id: '12345',
                           name: 'new-repo',
                           full_name: 'org/new-repo',
                           url: 'https://github.com/org/new-repo'
                         }

      expect_created
      expect(json_data[:name]).to eq('new-repo')
    end

    it 'returns 403 for non-admins' do
      authenticated_post "/api/v1/projects/#{project.id}/repositories",
                         user: member,
                         params: {
                           organization_connector_id: connector.id,
                           external_id: '12345',
                           name: 'new-repo',
                           full_name: 'org/new-repo'
                         }

      expect_forbidden
    end

    it 'links an existing org-level repository to the project' do
      existing_repo = create(:repository, project: nil, organization_connector: connector, external_id: '12345')

      expect {
        authenticated_post "/api/v1/projects/#{project.id}/repositories",
                           user: admin,
                           params: {
                             organization_connector_id: connector.id,
                             external_id: '12345',
                             name: existing_repo.name,
                             full_name: existing_repo.full_name,
                             url: existing_repo.url
                           }
      }.not_to change(Repository, :count)

      expect_created
      expect(existing_repo.reload.project_id).to eq(project.id)
    end

    it 'returns 422 when the repository is already linked to another project' do
      other_project = create(:project, organization: organization, owner: nil)
      create(:project_membership, user: admin, project: other_project, role: 'admin')
      existing_repo = create(:repository, project: other_project, organization_connector: connector, external_id: '12345')

      authenticated_post "/api/v1/projects/#{project.id}/repositories",
                         user: admin,
                         params: {
                           organization_connector_id: connector.id,
                           external_id: existing_repo.external_id,
                           name: existing_repo.name,
                           full_name: existing_repo.full_name,
                           url: existing_repo.url
                         }

      expect_unprocessable
      expect(json_response.dig(:errors, :external_id)).to include('repository is already linked to another project')
    end
  end

  describe 'PATCH /api/v1/projects/:project_id/repositories/:id' do
    it 'updates the repository as project admin' do
      authenticated_patch "/api/v1/projects/#{project.id}/repositories/#{repository.id}",
                          user: admin,
                          params: { default_branch: 'develop' }

      expect_success
      expect(json_data[:defaultBranch]).to eq('develop')
    end
  end

  describe 'DELETE /api/v1/projects/:project_id/repositories/:id' do
    it 'deletes the repository as project admin' do
      authenticated_delete "/api/v1/projects/#{project.id}/repositories/#{repository.id}", user: admin

      expect_no_content
      expect(Repository.find_by(id: repository.id)).to be_nil
    end
  end

  describe 'POST /api/v1/projects/:project_id/repositories/:id/sync' do
    it 'triggers a sync' do
      authenticated_post "/api/v1/projects/#{project.id}/repositories/#{repository.id}/sync", user: admin

      expect_success
      expect(repository.reload.last_sync_at).to be_present
    end
  end
end

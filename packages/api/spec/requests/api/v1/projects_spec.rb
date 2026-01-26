# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Api::V1::Projects', type: :request do
  let(:user) { create(:user) }
  let(:other_user) { create(:user) }
  let(:organization) { create(:organization) }
  let!(:membership) { create(:organization_membership, user: user, organization: organization, role: 'admin') }

  describe 'GET /api/v1/projects' do
    let!(:personal_project) { create(:project, owner: user, organization: nil) }
    let!(:org_project) { create(:project, organization: organization, owner: nil) }
    let!(:other_project) { create(:project, owner: other_user, organization: nil) }

    it 'returns all projects the user can access' do
      authenticated_get '/api/v1/projects', user: user

      expect_success
      ids = json_data.map { |p| p[:id] }
      expect(ids).to include(personal_project.id)
      expect(ids).to include(org_project.id)
      expect(ids).not_to include(other_project.id)
    end

    it 'filters personal projects' do
      authenticated_get '/api/v1/projects', user: user, params: { personal: 'true' }

      expect_success
      ids = json_data.map { |p| p[:id] }
      expect(ids).to include(personal_project.id)
      expect(ids).not_to include(org_project.id)
    end
  end

  describe 'GET /api/v1/organizations/:organization_id/projects' do
    let!(:org_project) { create(:project, organization: organization, owner: nil) }

    it 'returns organization projects' do
      authenticated_get "/api/v1/organizations/#{organization.id}/projects",
                        user: user,
                        organization: organization

      expect_success
      expect(json_data.first[:id]).to eq(org_project.id)
    end
  end

  describe 'GET /api/v1/projects/:id' do
    let!(:project) { create(:project, organization: organization, owner: nil) }

    it 'returns the project' do
      authenticated_get "/api/v1/projects/#{project.id}", user: user

      expect_success
      expect(json_data[:id]).to eq(project.id)
    end
  end

  describe 'POST /api/v1/projects' do
    it 'creates a personal project' do
      authenticated_post '/api/v1/projects', user: user, params: { name: 'My Project' }

      expect_created
      expect(json_data[:name]).to eq('My Project')
      expect(json_data[:isPersonal]).to be true
      expect(json_data[:ownerId]).to eq(user.id)
    end
  end

  describe 'POST /api/v1/organizations/:organization_id/projects' do
    it 'creates an organization project' do
      authenticated_post "/api/v1/organizations/#{organization.id}/projects",
                         user: user,
                         organization: organization,
                         params: { name: 'Org Project' }

      expect_created
      expect(json_data[:name]).to eq('Org Project')
      expect(json_data[:isPersonal]).to be false
      expect(json_data[:organizationId]).to eq(organization.id)
    end
  end

  describe 'PATCH /api/v1/projects/:id' do
    let!(:project) { create(:project, owner: user, organization: nil) }

    it 'updates the project' do
      authenticated_patch "/api/v1/projects/#{project.id}", user: user, params: { name: 'Updated' }

      expect_success
      expect(json_data[:name]).to eq('Updated')
    end

    it 'returns 403 for non-owners of personal projects' do
      authenticated_patch "/api/v1/projects/#{project.id}", user: other_user, params: { name: 'Hacked' }

      expect_forbidden
    end
  end

  describe 'DELETE /api/v1/projects/:id' do
    let!(:project) { create(:project, owner: user, organization: nil) }

    it 'deletes the project' do
      authenticated_delete "/api/v1/projects/#{project.id}", user: user

      expect_no_content
      expect(Project.find_by(id: project.id)).to be_nil
    end
  end

  describe 'GET /api/v1/projects/:id/settings' do
    let!(:project) { create(:project, owner: user, organization: nil) }
    let!(:setting) { create(:project_setting, project: project, key: 'feature_flag', value: 'enabled') }

    it 'returns project settings' do
      authenticated_get "/api/v1/projects/#{project.id}/settings", user: user

      expect_success
      expect(json_data.first[:key]).to eq('feature_flag')
    end
  end
end

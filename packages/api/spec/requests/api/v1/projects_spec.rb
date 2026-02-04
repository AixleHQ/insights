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

  describe 'GET /api/v1/projects/:id/stats' do
    let!(:project) { create(:project, organization: organization, owner: nil) }

    context 'with events' do
      before do
        # Create tool events for this project
        create(:tool_event, project: project, organization: organization, occurred_at: 1.day.ago, cost_usd: 0.10)
        create(:tool_event, project: project, organization: organization, occurred_at: 2.days.ago, cost_usd: 0.20)
        create(:tool_event, project: project, organization: organization, occurred_at: 3.days.ago, cost_usd: 0.15)
      end

      it 'returns daily event statistics' do
        authenticated_get "/api/v1/projects/#{project.id}/stats", user: user

        expect_success
        expect(json_response[:daily]).to be_an(Array)
        expect(json_response[:totalEvents]).to eq(3)
        expect(json_response[:totalCost]).to be_within(0.01).of(0.45)
      end

      it 'respects the days parameter' do
        authenticated_get "/api/v1/projects/#{project.id}/stats", user: user, params: { days: 1 }

        expect_success
        expect(json_response[:totalEvents]).to eq(1)
      end
    end

    context 'without events' do
      it 'returns empty stats' do
        authenticated_get "/api/v1/projects/#{project.id}/stats", user: user

        expect_success
        expect(json_response[:daily]).to eq([])
        expect(json_response[:totalEvents]).to eq(0)
        expect(json_response[:totalCost]).to eq(0.0)
      end
    end

    it 'returns 403 for unauthorized users' do
      authenticated_get "/api/v1/projects/#{project.id}/stats", user: other_user

      expect_forbidden
    end
  end

  describe 'GET /api/v1/projects/:id/stats/daily_by_tool' do
    let!(:project) { create(:project, organization: organization, owner: nil) }

    context 'with events from multiple tools' do
      before do
        create(:tool_event, project: project, organization: organization, tool_name: 'claude_code', occurred_at: 1.day.ago)
        create(:tool_event, project: project, organization: organization, tool_name: 'claude_code', occurred_at: 1.day.ago)
        create(:tool_event, project: project, organization: organization, tool_name: 'cursor', occurred_at: 1.day.ago)
        create(:tool_event, project: project, organization: organization, tool_name: 'github_copilot', occurred_at: 2.days.ago)
      end

      it 'returns daily data grouped by tool' do
        authenticated_get "/api/v1/projects/#{project.id}/stats/daily_by_tool", user: user

        expect_success
        expect(json_response[:data]).to be_an(Array)
        expect(json_response[:tools]).to include('claude_code')
      end

      it 'includes top tools and Other category' do
        authenticated_get "/api/v1/projects/#{project.id}/stats/daily_by_tool", user: user

        expect_success
        expect(json_response[:tools]).to include('Other')
      end
    end

    context 'without events' do
      it 'returns empty data' do
        authenticated_get "/api/v1/projects/#{project.id}/stats/daily_by_tool", user: user

        expect_success
        expect(json_response[:data]).to eq([])
        expect(json_response[:tools]).to eq(['Other'])
      end
    end
  end

  describe 'GET /api/v1/projects/:id/members' do
    let!(:project) { create(:project, organization: organization, owner: nil) }

    context 'with project members' do
      let!(:project_membership) { create(:project_membership, project: project, user: user, role: 'owner') }

      it 'returns project members' do
        authenticated_get "/api/v1/projects/#{project.id}/members", user: user

        expect_success
        expect(json_response[:data]).to be_an(Array)
        expect(json_response[:data].length).to eq(1)
        expect(json_response[:data].first[:userId]).to eq(user.id)
        expect(json_response[:data].first[:role]).to eq('owner')
      end

      it 'includes member details' do
        authenticated_get "/api/v1/projects/#{project.id}/members", user: user

        expect_success
        member_data = json_response[:data].first
        expect(member_data).to have_key(:email)
        expect(member_data).to have_key(:name)
        expect(member_data).to have_key(:avatarUrl)
        expect(member_data).to have_key(:joinedAt)
      end
    end

    context 'without project members' do
      it 'returns empty array' do
        authenticated_get "/api/v1/projects/#{project.id}/members", user: user

        expect_success
        expect(json_response[:data]).to eq([])
      end
    end

    it 'returns 403 for unauthorized users' do
      authenticated_get "/api/v1/projects/#{project.id}/members", user: other_user

      expect_forbidden
    end
  end
end

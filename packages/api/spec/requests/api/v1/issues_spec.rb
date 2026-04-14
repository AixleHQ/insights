# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Api::V1::Issues', type: :request do
  let(:admin) { create(:user) }
  let(:member) { create(:user) }
  let(:outsider) { create(:user) }
  let(:organization) { create(:organization) }
  let!(:admin_membership) { create(:organization_membership, user: admin, organization: organization, role: 'admin') }
  let!(:member_membership) { create(:organization_membership, user: member, organization: organization, role: 'member') }

  let!(:project) { create(:project, organization: organization, owner: nil) }
  let!(:project_membership_admin) { create(:project_membership, project: project, user: admin, role: 'admin') }
  let!(:project_membership_member) { create(:project_membership, project: project, user: member, role: 'member') }

  let!(:connector) { create(:organization_connector, :jira, organization: organization) }

  describe 'GET /api/v1/projects/:project_id/issues' do
    let!(:issue_todo) { create(:issue, :todo, project: project, organization: organization, organization_connector: connector) }
    let!(:issue_in_progress) { create(:issue, :in_progress, project: project, organization: organization, organization_connector: connector) }
    let!(:issue_done) { create(:issue, :done, project: project, organization: organization, organization_connector: connector) }
    let!(:issue_bug) { create(:issue, :bug, project: project, organization: organization, organization_connector: connector) }

    it 'returns all issues for the project' do
      authenticated_get "/api/v1/projects/#{project.id}/issues", user: member

      expect_success
      expect(json_data.length).to eq(4)
    end

    it 'filters by status_category' do
      authenticated_get "/api/v1/projects/#{project.id}/issues",
                        user: member,
                        params: { status_category: 'done' }

      expect_success
      expect(json_data.length).to eq(1)
      expect(json_data.first[:statusCategory]).to eq('done')
    end

    it 'filters by issue type' do
      authenticated_get "/api/v1/projects/#{project.id}/issues",
                        user: member,
                        params: { type: 'Bug' }

      expect_success
      expect(json_data.length).to eq(1)
      expect(json_data.first[:issueType]).to eq('Bug')
    end

    it 'filters by assignee' do
      assignee = create(:user)
      assigned_issue = create(:issue, :with_assignee, project: project, organization: organization,
                              organization_connector: connector, assignee: assignee)

      authenticated_get "/api/v1/projects/#{project.id}/issues",
                        user: member,
                        params: { assignee: assignee.id }

      expect_success
      expect(json_data.length).to eq(1)
      expect(json_data.first[:id]).to eq(assigned_issue.id)
    end

    it 'returns paginated results' do
      authenticated_get "/api/v1/projects/#{project.id}/issues",
                        user: member,
                        params: { per_page: 2 }

      expect_success
      expect(json_data.length).to eq(2)
      expect(json_meta[:totalCount]).to eq(4)
    end

    it 'returns 403 for users not in the project' do
      authenticated_get "/api/v1/projects/#{project.id}/issues", user: outsider

      expect_forbidden
    end

    it 'returns 401 without authentication' do
      get "/api/v1/projects/#{project.id}/issues"

      expect_unauthorized
    end

    it 'does not return issues from other projects' do
      other_project = create(:project, organization: organization, owner: nil)
      create(:project_membership, project: other_project, user: member, role: 'member')
      create(:issue, project: other_project, organization: organization, organization_connector: connector)

      authenticated_get "/api/v1/projects/#{project.id}/issues", user: member

      expect_success
      expect(json_data.length).to eq(4)
    end

    it 'serializes issue fields correctly' do
      authenticated_get "/api/v1/projects/#{project.id}/issues",
                        user: member,
                        params: { status_category: 'done' }

      expect_success
      issue_data = json_data.first
      expect(issue_data).to have_key(:id)
      expect(issue_data).to have_key(:key)
      expect(issue_data).to have_key(:summary)
      expect(issue_data).to have_key(:status)
      expect(issue_data).to have_key(:statusCategory)
      expect(issue_data).to have_key(:issueType)
      expect(issue_data).to have_key(:priority)
      expect(issue_data).to have_key(:jiraProjectKey)
      expect(issue_data).to have_key(:labels)
    end
  end

  describe 'GET /api/v1/projects/:project_id/issues/:id' do
    let!(:issue) { create(:issue, project: project, organization: organization, organization_connector: connector) }

    it 'returns the issue' do
      authenticated_get "/api/v1/projects/#{project.id}/issues/#{issue.id}", user: member

      expect_success
      expect(json_data[:id]).to eq(issue.id)
      expect(json_data[:key]).to eq(issue.key)
      expect(json_data[:summary]).to eq(issue.summary)
    end

    it 'returns 403 for users not in the project' do
      authenticated_get "/api/v1/projects/#{project.id}/issues/#{issue.id}", user: outsider

      expect_forbidden
    end

    it 'returns 404 for issues in other projects' do
      other_project = create(:project, organization: organization, owner: nil)
      other_issue = create(:issue, project: other_project, organization: organization, organization_connector: connector)

      authenticated_get "/api/v1/projects/#{project.id}/issues/#{other_issue.id}", user: member

      expect_not_found
    end

    it 'returns 401 without authentication' do
      get "/api/v1/projects/#{project.id}/issues/#{issue.id}"

      expect_unauthorized
    end
  end
end

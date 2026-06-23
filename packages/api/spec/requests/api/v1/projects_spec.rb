# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Api::V1::Projects', type: :request do
  let(:user) { create(:user) }
  let(:other_user) { create(:user) }
  let(:organization) { create(:organization) }
  let!(:membership) { create(:organization_membership, user: user, organization: organization, role: 'owner') }

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

    it 'includes batched lifetime aggregate stats for each project on the page' do
      other = create(:project, organization: organization, owner: nil)
      t1 = Time.zone.parse('2026-01-10T12:00:00Z')
      t2 = Time.zone.parse('2026-01-11T15:30:00Z')
      create(:tool_event, organization: organization, project: org_project, occurred_at: t1, cost_usd: 0.5)
      create(:tool_event, organization: organization, project: org_project, occurred_at: t2, cost_usd: 1.25)
      create(:tool_event, organization: organization, project: other, occurred_at: t1, cost_usd: 3.0)

      authenticated_get "/api/v1/organizations/#{organization.id}/projects",
                        user: user,
                        organization: organization

      expect_success
      by_id = json_data.index_by { |p| p[:id] }
      expect(by_id[org_project.id][:eventCount]).to eq(2)
      expect(by_id[org_project.id][:totalCostUsd]).to eq(1.75)
      expect(by_id[org_project.id][:lastEventAt]).to eq(t2.iso8601)
      expect(by_id[other.id][:eventCount]).to eq(1)
      expect(by_id[other.id][:totalCostUsd]).to eq(3.0)
      expect(by_id[other.id][:lastEventAt]).to eq(t1.iso8601)
    end

    it 'returns zero aggregates when a project has no attributed tool events' do
      authenticated_get "/api/v1/organizations/#{organization.id}/projects",
                        user: user,
                        organization: organization

      expect_success
      row = json_data.find { |p| p[:id] == org_project.id }
      expect(row[:eventCount]).to eq(0)
      expect(row[:totalCostUsd]).to eq(0.0)
      expect(row[:lastEventAt]).to be_nil
    end
  end

  describe 'GET /api/v1/projects/:id' do
    let!(:project) { create(:project, organization: organization, owner: nil) }

    it 'returns the project' do
      authenticated_get "/api/v1/projects/#{project.id}", user: user

      expect_success
      expect(json_data[:id]).to eq(project.id)
    end

    it 'includes lifetime aggregate stats from attributed tool_events' do
      t1 = Time.zone.parse('2026-02-01T08:00:00Z')
      t2 = Time.zone.parse('2026-02-02T09:00:00Z')
      create(:tool_event, organization: organization, project: project, occurred_at: t1, cost_usd: 0.1)
      create(:tool_event, organization: organization, project: project, occurred_at: t2, cost_usd: 0.2)

      authenticated_get "/api/v1/projects/#{project.id}", user: user

      expect_success
      expect(json_data[:eventCount]).to eq(2)
      expect(json_data[:totalCostUsd]).to eq(0.3)
      expect(json_data[:lastEventAt]).to eq(t2.iso8601)
    end

    it 'returns zero event count and null lastEventAt when there are no attributed events' do
      authenticated_get "/api/v1/projects/#{project.id}", user: user

      expect_success
      expect(json_data[:eventCount]).to eq(0)
      expect(json_data[:totalCostUsd]).to eq(0.0)
      expect(json_data[:lastEventAt]).to be_nil
    end

    it 'scopes lifetime aggregates to this project only' do
      other = create(:project, organization: organization, owner: nil)
      t_here = Time.zone.parse('2026-02-02T09:00:00Z')
      t_elsewhere = Time.zone.parse('2026-02-05T12:00:00Z')
      create(:tool_event, organization: organization, project: project, occurred_at: t_here, cost_usd: 0.1)
      create(:tool_event, organization: organization, project: other, occurred_at: t_elsewhere, cost_usd: 9.0)

      authenticated_get "/api/v1/projects/#{project.id}", user: user

      expect_success
      expect(json_data[:eventCount]).to eq(1)
      expect(json_data[:totalCostUsd]).to eq(0.1)
      expect(json_data[:lastEventAt]).to eq(t_here.iso8601)
    end

    it 'includes source control summary for linked gitlab repositories' do
      connector = create(:organization_connector, organization: organization, connector_type: 'gitlab')
      repository = create(:repository, organization_connector: connector, project: project)
      create(:tool_event, organization: organization, project: project, repository: repository, tool_name: 'gitlab', event_type: 'commit')
      create(:tool_event, organization: organization, project: project, repository: repository, tool_name: 'gitlab', event_type: 'review')
      create(:tool_event, organization: organization, project: project, repository: repository, tool_name: 'gitlab', event_type: 'other', metadata: { pipeline_id: '123' })

      authenticated_get "/api/v1/projects/#{project.id}", user: user

      expect_success
      summary = json_data[:sourceControlSummary].find { |item| item[:provider] == 'gitlab' }
      expect(summary[:repositoryCount]).to eq(1)
      expect(summary[:commitCount]).to eq(1)
      expect(summary[:reviewCount]).to eq(1)
      expect(summary[:pipelineCount]).to eq(1)
      expect(summary).not_to have_key(:repository_count)
      expect(summary).not_to have_key(:commit_count)
      expect(summary).not_to have_key(:review_count)
      expect(summary).not_to have_key(:pipeline_count)
    end

    it 'includes linear issue throughput summary for project members' do
      connector = create(:organization_connector, :linear, organization: organization, last_sync_at: Time.zone.parse('2026-04-29T11:22:58Z'))
      project.project_settings.create!(key: 'linear_connector_id', value: connector.id.to_s)

      # One completed issue that has been updated (stateChangeCount = 1)
      create(
        :issue, :done,
        organization: organization,
        project: project,
        organization_connector: connector,
        external_id: 'issue-1',
        key: 'ENG-101',
        external_created_at: Time.zone.parse('2026-04-28T10:00:00Z'),
        external_updated_at: Time.zone.parse('2026-04-29T11:00:00Z'),
        metadata: { 'cycle_id' => 'cycle-1', 'provider' => 'linear' }
      )

      authenticated_get "/api/v1/projects/#{project.id}", user: user

      expect_success
      summary = json_data[:issueThroughputSummary].find { |item| item[:provider] == 'linear' }
      expect(summary[:issueCount]).to eq(1)
      expect(summary[:completedCount]).to eq(1)
      expect(summary[:stateChangeCount]).to eq(1)
      expect(summary[:cycleCount]).to eq(1)
      expect(summary).not_to have_key(:issue_count)
      expect(summary).not_to have_key(:completed_count)
      expect(summary).not_to have_key(:state_change_count)
      expect(summary).not_to have_key(:cycle_count)
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

    it 'creates a project.create audit log' do
      expect {
        authenticated_post '/api/v1/projects', user: user, params: { name: 'My Project' }
      }.to change(ProjectAuditLog, :count).by(1)

      expect(OrganizationAuditLog.count).to eq(0)

      log = ProjectAuditLog.last
      expect(log.action).to eq('project.create')
      expect(log.actor).to eq(user)
      expect(log.tracked_changes).to include('name' => 'My Project', 'is_personal' => true)
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

    it 'creates project.create audit logs on the project and organization' do
      expect {
        authenticated_post "/api/v1/organizations/#{organization.id}/projects",
                           user: user,
                           organization: organization,
                           params: { name: 'Org Project' }
      }.to change(ProjectAuditLog, :count).by(1)
         .and change(OrganizationAuditLog, :count).by(1)

      expect_created
      project = Project.find(json_data[:id])
      project_log = ProjectAuditLog.find_by!(project: project, action: 'project.create')
      org_log = OrganizationAuditLog.find_by!(organization: organization, action: 'project.create')

      expect(project_log.actor).to eq(user)
      expect(project_log.tracked_changes).to include('name' => 'Org Project')
      expect(org_log.actor).to eq(user)
      expect(org_log.resource_type).to eq('Project')
      expect(org_log.resource_id).to eq(project.id)
      expect(org_log.tracked_changes).to include('name' => 'Org Project')
      expect(org_log.tracked_changes).not_to have_key('is_personal')
    end
  end

  describe 'POST /api/v1/organizations/:organization_id/projects (duplicate git_remote_url)' do
    it 'returns 422 with git_remote_url error naming the conflicting project when URL is duplicate' do
      existing = create(:project, organization: organization, owner: nil,
                                  git_remote_url: 'git@github.com:org/repo.git')

      authenticated_post "/api/v1/organizations/#{organization.id}/projects",
                         user: user,
                         organization: organization,
                         params: { name: 'Duplicate Attempt', git_remote_url: 'git@github.com:org/repo.git' }

      expect(response).to have_http_status(:unprocessable_content)
      expect(json_response[:errors][:git_remote_url].first).to include(existing.name)
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

    it 'does not create an organization audit log for personal projects' do
      expect {
        authenticated_delete "/api/v1/projects/#{project.id}", user: user
      }.not_to change(OrganizationAuditLog, :count)
    end
  end

  describe 'DELETE /api/v1/projects/:id (organization project)' do
    let!(:org_project) { create(:project, organization: organization, owner: nil) }

    it 'creates a project.delete organization audit log before destroy' do
      project_id = org_project.id

      expect {
        authenticated_delete "/api/v1/projects/#{org_project.id}",
                           user: user,
                           organization: organization
      }.to change(OrganizationAuditLog, :count).by(1)

      expect_no_content
      expect(Project.find_by(id: project_id)).to be_nil

      log = OrganizationAuditLog.order(:created_at).last
      expect(log.action).to eq('project.delete')
      expect(log.organization).to eq(organization)
      expect(log.actor).to eq(user)
      expect(log.resource_type).to eq('Project')
      expect(log.resource_id).to eq(project_id)
      expect(log.tracked_changes).to include(
        'project_id' => project_id,
        'name' => org_project.name,
        'slug' => org_project.slug
      )
    end

    it 'rolls back the audit log if destroy! raises' do
      allow_any_instance_of(Project).to receive(:destroy!).and_raise(ActiveRecord::RecordNotDestroyed)

      initial_count = OrganizationAuditLog.count
      begin
        authenticated_delete "/api/v1/projects/#{org_project.id}",
                             user: user,
                             organization: organization
      rescue ActiveRecord::RecordNotDestroyed
        nil
      end

      expect(OrganizationAuditLog.count).to eq(initial_count)
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

  describe 'PUT /api/v1/projects/:id/settings/:key' do
    let!(:project) { create(:project, owner: user, organization: nil) }

    it 'creates a settings.create audit log for a new key' do
      expect {
        authenticated_put "/api/v1/projects/#{project.id}/settings/new_key",
                          user: user,
                          params: { value: 'some_value' }
      }.to change(ProjectAuditLog, :count).by(1)

      log = ProjectAuditLog.last
      expect(log.action).to eq('settings.create')
      expect(log.actor).to eq(user)
      expect(log.tracked_changes['key']).to eq('new_key')
      expect(log.tracked_changes['after']).to eq('some_value')
    end

    it 'creates a settings.update audit log for an existing key' do
      create(:project_setting, project: project, key: 'existing_key', value: 'old_value')

      expect {
        authenticated_put "/api/v1/projects/#{project.id}/settings/existing_key",
                          user: user,
                          params: { value: 'new_value' }
      }.to change(ProjectAuditLog, :count).by(1)

      log = ProjectAuditLog.last
      expect(log.action).to eq('settings.update')
      expect(log.actor).to eq(user)
      expect(log.tracked_changes['key']).to eq('existing_key')
      expect(log.tracked_changes['before']).to eq('old_value')
      expect(log.tracked_changes['after']).to eq('new_value')
    end
  end

  describe 'DELETE /api/v1/projects/:id/settings/:key' do
    let!(:project) { create(:project, owner: user, organization: nil) }
    let!(:setting) { create(:project_setting, project: project, key: 'delete_me', value: 'goodbye') }

    it 'creates a settings.delete audit log' do
      expect {
        authenticated_delete "/api/v1/projects/#{project.id}/settings/delete_me", user: user
      }.to change(ProjectAuditLog, :count).by(1)

      log = ProjectAuditLog.last
      expect(log.action).to eq('settings.delete')
      expect(log.actor).to eq(user)
      expect(log.tracked_changes['key']).to eq('delete_me')
      expect(log.tracked_changes['before']).to eq('goodbye')
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
      it 'returns zero-filled data for the requested window' do
        authenticated_get "/api/v1/projects/#{project.id}/stats/daily_by_tool", user: user,
                          params: { days: 7 }

        expect_success
        expect(json_response[:data].length).to eq(8) # 7 days + today, zero-filled
        expect(json_response[:data]).to all(have_key(:date))
        expect(json_response[:tools]).to eq([ 'Other' ])
      end
    end

    context 'with granularity=day (default)' do
      before do
        create(:tool_event, project: project, organization: organization, tool_name: 'claude_code',
               occurred_at: 2.days.ago)
        create(:tool_event, project: project, organization: organization, tool_name: 'claude_code',
               occurred_at: 2.days.ago)
        create(:tool_event, project: project, organization: organization, tool_name: 'cursor',
               occurred_at: 1.day.ago)
      end

      it 'returns daily data points for the specified days window' do
        authenticated_get "/api/v1/projects/#{project.id}/stats/daily_by_tool", user: user,
                          params: { days: 7 }

        expect_success
        dates = json_response[:data].map { |d| d[:date] }
        expect(dates.length).to eq(8) # today + 7 days back
        expect(json_response[:granularity]).to eq('day')
      end

      it 'zero-fills days with no events' do
        authenticated_get "/api/v1/projects/#{project.id}/stats/daily_by_tool", user: user,
                          params: { days: 7 }

        expect_success
        today = json_response[:data].find { |d| d[:date] == Date.today.iso8601 }
        expect(today).to be_present
        expect(today.keys).to contain_exactly(:date)
      end
    end

    context 'with granularity=month' do
      before do
        create(:tool_event, project: project, organization: organization, tool_name: 'claude_code',
               occurred_at: 2.months.ago)
        create(:tool_event, project: project, organization: organization, tool_name: 'claude_code',
               occurred_at: 2.months.ago)
        create(:tool_event, project: project, organization: organization, tool_name: 'cursor',
               occurred_at: 1.month.ago)
      end

      it 'returns monthly buckets for days=365' do
        authenticated_get "/api/v1/projects/#{project.id}/stats/daily_by_tool", user: user,
                          params: { days: 365, granularity: 'month' }

        expect_success
        expect(json_response[:data].length).to eq(13) # current month + 12 months back
        expect(json_response[:granularity]).to eq('month')
      end

      it 'zero-fills months with no events' do
        authenticated_get "/api/v1/projects/#{project.id}/stats/daily_by_tool", user: user,
                          params: { days: 365, granularity: 'month' }

        expect_success
        this_month = Date.today.beginning_of_month.iso8601
        current_bucket = json_response[:data].find { |d| d[:date] == this_month }
        expect(current_bucket).to be_present
      end

      it 'aggregates tool events by month correctly' do
        authenticated_get "/api/v1/projects/#{project.id}/stats/daily_by_tool", user: user,
                          params: { days: 365, granularity: 'month' }

        expect_success
        two_months_ago = 2.months.ago.beginning_of_month.to_date.iso8601
        bucket = json_response[:data].find { |d| d[:date] == two_months_ago }
        expect(bucket).to be_present
        expect(bucket[:claude_code]).to eq(2)
      end

      it 'returns granularity=month in response' do
        authenticated_get "/api/v1/projects/#{project.id}/stats/daily_by_tool", user: user,
                          params: { days: 365, granularity: 'month' }

        expect_success
        expect(json_response[:granularity]).to eq('month')
      end
    end

    context 'with days=90' do
      before do
        create(:tool_event, project: project, organization: organization, tool_name: 'claude_code',
               occurred_at: 45.days.ago)
      end

      it 'returns 91 daily data points (zero-filled)' do
        authenticated_get "/api/v1/projects/#{project.id}/stats/daily_by_tool", user: user,
                          params: { days: 90 }

        expect_success
        expect(json_response[:data].length).to eq(91) # today + 90 days back
        expect(json_response[:granularity]).to eq('day')
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

    it 'returns 404 for unauthorized users (project not visible via authorized_scope)' do
      authenticated_get "/api/v1/projects/#{project.id}/members", user: other_user

      expect_not_found
    end
  end

  describe 'GET /api/v1/projects/:id/retention_policy' do
    let!(:project) { create(:project, organization: organization, owner: nil) }
    let!(:project_membership) { create(:project_membership, project: project, user: user, role: "owner") }

    it 'returns the retention policy with camelCase keys' do
      authenticated_get "/api/v1/projects/#{project.id}/retention_policy", user: user

      expect_success
      expect(json_data[:rawEventTtl]).to eq('24_hours')
      expect(json_data[:toolEventsRetention]).to eq('90_days')
      expect(json_data[:hourlyAggregateRetention]).to eq('365_days')
      expect(json_data[:dailyAggregateRetention]).to eq('forever')
      expect(json_data[:projectId]).to eq(project.id)
    end

    it 'returns 403 for non-admin members' do
      non_admin = create(:user)
      create(:organization_membership, user: non_admin, organization: organization, role: 'member')
      authenticated_get "/api/v1/projects/#{project.id}/retention_policy", user: non_admin

      expect_forbidden
    end

    it 'returns 401 for unauthenticated requests' do
      get "/api/v1/projects/#{project.id}/retention_policy"

      expect(response).to have_http_status(:unauthorized)
    end
  end

  describe 'GET /api/v1/projects/:id/stats/commits_by_user' do
    let!(:project) { create(:project, organization: organization, owner: nil) }
    let!(:other_member) { create(:user) }

    context 'with commit events' do
      before do
        create(:tool_event, project: project, organization: organization,
               user: user, event_type: 'commit', tool_name: 'github_copilot',
               occurred_at: 1.day.ago)
        create(:tool_event, project: project, organization: organization,
               user: user, event_type: 'commit', tool_name: 'github_copilot',
               occurred_at: 2.days.ago)
        create(:tool_event, project: project, organization: organization,
               user: other_member, event_type: 'commit', tool_name: 'github_copilot',
               occurred_at: 1.day.ago)
      end

      it 'returns pagination meta' do
        authenticated_get "/api/v1/projects/#{project.id}/stats/commits_by_user", user: user

        expect_success
        expect(json_response[:meta]).to include(
          :current_page, :total_pages, :total_count, :per_page
        )
      end

      it 'returns commit counts grouped by user' do
        authenticated_get "/api/v1/projects/#{project.id}/stats/commits_by_user", user: user

        expect_success
        data = json_response[:data]
        top_user = data.find { |d| d[:userId] == user.id }
        expect(top_user[:commitCount]).to eq(2)
      end

      it 'respects per_page param' do
        authenticated_get "/api/v1/projects/#{project.id}/stats/commits_by_user",
                          user: user, params: { per_page: 1 }

        expect_success
        expect(json_response[:data].length).to eq(1)
        expect(json_response[:meta][:total_count]).to eq(2)
        expect(json_response[:meta][:total_pages]).to eq(2)
      end

      it 'respects page param' do
        authenticated_get "/api/v1/projects/#{project.id}/stats/commits_by_user",
                          user: user, params: { per_page: 1, page: 2 }

        expect_success
        expect(json_response[:data].length).to eq(1)
        expect(json_response[:meta][:current_page]).to eq(2)
      end
    end

    context 'without commit events' do
      it 'returns empty data with pagination meta' do
        authenticated_get "/api/v1/projects/#{project.id}/stats/commits_by_user", user: user

        expect_success
        expect(json_response[:data]).to eq([])
        expect(json_response[:meta][:total_count]).to eq(0)
      end
    end

    it 'returns 403 for unauthorized users' do
      authenticated_get "/api/v1/projects/#{project.id}/stats/commits_by_user", user: other_user

      expect_forbidden
    end
  end

  describe 'PATCH /api/v1/projects/:id/retention_policy' do
    let!(:project) { create(:project, organization: organization, owner: nil) }
    let!(:project_membership) { create(:project_membership, project: project, user: user, role: "owner") }

    it 'updates the retention policy and returns 200' do
      authenticated_patch "/api/v1/projects/#{project.id}/retention_policy",
                          user: user,
                          params: { raw_event_ttl: '48_hours' }

      expect_success
      expect(json_data[:rawEventTtl]).to eq('48_hours')
    end

    it 'creates a project audit log on update' do
      expect {
        authenticated_patch "/api/v1/projects/#{project.id}/retention_policy",
                            user: user,
                            params: { tool_events_retention: '180_days' }
      }.to change(ProjectAuditLog, :count).by(1)

      log = ProjectAuditLog.last
      expect(log.action).to eq('retention.update')
      expect(log.actor).to eq(user)
    end

    it 'creates alert.update when alert thresholds change' do
      expect {
        authenticated_patch "/api/v1/projects/#{project.id}/retention_policy",
                            user: user,
                            params: { cost_threshold_cents: 500, alert_enabled: true }
      }.to change(ProjectAuditLog, :count).by(1)

      expect(ProjectAuditLog.last.action).to eq('alert.update')
    end

    it 'returns 422 with errors for invalid enum value' do
      authenticated_patch "/api/v1/projects/#{project.id}/retention_policy",
                          user: user,
                          params: { raw_event_ttl: 'invalid_value' }

      expect(response).to have_http_status(:unprocessable_content)
      expect(json_response[:errors]).to be_present
    end

    it 'returns 403 for non-admin members' do
      non_admin = create(:user)
      create(:organization_membership, user: non_admin, organization: organization, role: 'member')
      authenticated_patch "/api/v1/projects/#{project.id}/retention_policy",
                          user: non_admin,
                          params: { raw_event_ttl: '48_hours' }

      expect_forbidden
    end

    it 'persists cost_threshold_cents and token_threshold alert fields' do
      authenticated_patch "/api/v1/projects/#{project.id}/retention_policy",
                          user: user,
                          params: { cost_threshold_cents: 200, token_threshold: 50_000, alert_enabled: true }

      expect_success
      expect(json_data[:costThresholdCents]).to eq(200)
      expect(json_data[:tokenThreshold]).to eq(50_000)
      expect(json_data[:alertEnabled]).to be true
    end
  end

  describe 'POST /api/v1/projects/:id/link_jira' do
    let!(:project) { create(:project, organization: organization, owner: nil) }
    let!(:project_membership) { create(:project_membership, project: project, user: user, role: "owner") }
    let!(:connector) { create(:organization_connector, :jira, organization: organization) }

    it 'saves jira_connector_id and jira_project_key settings' do
      authenticated_post "/api/v1/projects/#{project.id}/link_jira",
                         user: user,
                         params: { connector_id: connector.id, jira_project_key: 'SCRUM' }

      expect_success
      expect(json_data[:linked]).to be true
      expect(project.project_settings.find_by(key: 'jira_connector_id')&.value).to eq(connector.id.to_s)
      expect(project.project_settings.find_by(key: 'jira_project_key')&.value).to eq('SCRUM')
    end

    it 'overwrites existing settings on re-link' do
      project.project_settings.create!(key: 'jira_connector_id', value: connector.id.to_s)
      project.project_settings.create!(key: 'jira_project_key', value: 'OLD')

      authenticated_post "/api/v1/projects/#{project.id}/link_jira",
                         user: user,
                         params: { connector_id: connector.id, jira_project_key: 'NEW' }

      expect_success
      expect(project.reload.project_settings.find_by(key: 'jira_project_key')&.value).to eq('NEW')
    end

    it 'returns 404 when connector belongs to another org' do
      other_org = create(:organization)
      other_connector = create(:organization_connector, :jira, organization: other_org)

      authenticated_post "/api/v1/projects/#{project.id}/link_jira",
                         user: user,
                         params: { connector_id: other_connector.id, jira_project_key: 'SCRUM' }

      expect_not_found
    end

    it 'returns 403 for project members without update permission' do
      member_only = create(:user)
      create(:organization_membership, user: member_only, organization: organization, role: 'member')
      create(:project_membership, project: project, user: member_only, role: 'member')

      authenticated_post "/api/v1/projects/#{project.id}/link_jira",
                         user: member_only,
                         params: { connector_id: connector.id, jira_project_key: 'SCRUM' }

      expect_forbidden
    end

    it 'returns 401 without authentication' do
      post "/api/v1/projects/#{project.id}/link_jira",
           params: { connector_id: connector.id, jira_project_key: 'SCRUM' }

      expect_unauthorized
    end

    it 'returns 422 for an invalid jira_project_key format' do
      authenticated_post "/api/v1/projects/#{project.id}/link_jira",
                         user: user,
                         params: { connector_id: connector.id, jira_project_key: 'invalid key!' }

      expect_unprocessable
    end
  end

  describe 'POST /api/v1/projects/:id/link_linear' do
    let!(:project) { create(:project, organization: organization, owner: nil) }
    let!(:project_membership) { create(:project_membership, project: project, user: user, role: "owner") }
    let!(:connector) { create(:organization_connector, :linear, organization: organization) }

    it 'saves linear connector and project settings' do
      authenticated_post "/api/v1/projects/#{project.id}/link_linear",
                         user: user,
                         params: { connector_id: connector.id, linear_project_id: 'project-1', linear_project_name: 'Platform' }

      expect_success
      expect(json_data[:linked]).to be true
      expect(project.project_settings.find_by(key: 'linear_connector_id')&.value).to eq(connector.id.to_s)
      expect(project.project_settings.find_by(key: 'linear_project_id')&.value).to eq('project-1')
      expect(project.project_settings.find_by(key: 'linear_project_name')&.value).to eq('Platform')
    end

    it 'clears jira settings when switching providers' do
      jira_connector = create(:organization_connector, :jira, organization: organization)
      project.project_settings.create!(key: 'jira_connector_id', value: jira_connector.id.to_s)
      project.project_settings.create!(key: 'jira_project_key', value: 'SCRUM')

      authenticated_post "/api/v1/projects/#{project.id}/link_linear",
                         user: user,
                         params: { connector_id: connector.id, linear_project_id: 'project-1', linear_project_name: 'Platform' }

      expect_success
      expect(project.reload.project_settings.find_by(key: 'jira_connector_id')).to be_nil
      expect(project.project_settings.find_by(key: 'jira_project_key')).to be_nil
    end

    it 'returns 403 for project members without admin permission' do
      member_only = create(:user)
      create(:organization_membership, user: member_only, organization: organization, role: 'member')
      create(:project_membership, project: project, user: member_only, role: 'member')

      authenticated_post "/api/v1/projects/#{project.id}/link_linear",
                         user: member_only,
                         params: { connector_id: connector.id, linear_project_id: 'project-1', linear_project_name: 'Platform' }

      expect_forbidden
    end

    it 'returns 401 without authentication' do
      post "/api/v1/projects/#{project.id}/link_linear",
           params: { connector_id: connector.id, linear_project_id: 'project-1', linear_project_name: 'Platform' }

      expect_unauthorized
    end

    it 'returns 422 when connector_id belongs to a non-linear connector' do
      jira_connector = create(:organization_connector, :jira, organization: organization)

      authenticated_post "/api/v1/projects/#{project.id}/link_linear",
                         user: user,
                         params: { connector_id: jira_connector.id, linear_project_id: 'project-1', linear_project_name: 'Platform' }

      expect_unprocessable
    end
  end

  describe 'POST /api/v1/projects/:id/sync_issues' do
    let!(:project) { create(:project, organization: organization, owner: nil) }
    let!(:project_membership) { create(:project_membership, project: project, user: user, role: "owner") }
    let!(:connector) { create(:organization_connector, :jira, organization: organization) }

    before do
      project.project_settings.create!(key: 'jira_connector_id', value: connector.id.to_s)
      project.project_settings.create!(key: 'jira_project_key', value: 'SCRUM')
      allow(JiraSyncJob).to receive(:perform_later)
    end

    it 'enqueues the sync job and returns 202 with queued: true' do
      authenticated_post "/api/v1/projects/#{project.id}/sync_issues", user: user

      expect(response).to have_http_status(:accepted)
      expect(json_data[:queued]).to be true
      expect(JiraSyncJob).to have_received(:perform_later).with(connector.id, 'sync', project_id: project.id)
    end

    it 'returns 422 when no Jira project is linked' do
      project.project_settings.find_by(key: 'jira_connector_id')&.destroy!

      authenticated_post "/api/v1/projects/#{project.id}/sync_issues", user: user

      expect_unprocessable
    end

    it 'returns 401 without authentication' do
      post "/api/v1/projects/#{project.id}/sync_issues"

      expect_unauthorized
    end

    it 'dispatches to LinearSyncJob when a Linear project is linked' do
      linear_connector = create(:organization_connector, :linear, organization: organization)
      project.project_settings.where(key: %w[jira_connector_id jira_project_key]).destroy_all
      project.project_settings.create!(key: 'linear_connector_id', value: linear_connector.id.to_s)
      project.project_settings.create!(key: 'linear_project_id', value: 'project-1')
      allow(LinearSyncJob).to receive(:perform_later)

      authenticated_post "/api/v1/projects/#{project.id}/sync_issues", user: user

      expect(response).to have_http_status(:accepted)
      expect(LinearSyncJob).to have_received(:perform_later).with(linear_connector.id, 'sync', project_id: project.id)
    end

    it 'returns 422 when the linked connector type is not supported' do
      unsupported = create(:organization_connector, organization: organization, connector_type: 'github')
      project.project_settings.where(key: %w[jira_connector_id jira_project_key]).destroy_all
      project.project_settings.create!(key: 'jira_connector_id', value: unsupported.id.to_s)

      authenticated_post "/api/v1/projects/#{project.id}/sync_issues", user: user

      expect_unprocessable
    end
  end
end

# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Api::V1::Events', type: :request do
  let(:user) { create(:user) }
  let(:organization) { create(:organization) }
  let!(:membership) { create(:organization_membership, user: user, organization: organization, role: 'member') }

  let!(:tool_event) do
    create(:tool_event,
           organization: organization,
           user: user,
           tool_name: 'claude_code',
           event_type: 'chat',
           tokens_in: 100,
           tokens_out: 500)
  end

  describe 'GET /api/v1/organizations/:organization_id/events' do
    it 'returns events for the organization' do
      authenticated_get "/api/v1/organizations/#{organization.id}/events",
                        user: user,
                        organization: organization

      expect_success
      expect(json_data).to be_an(Array)
      expect(json_data.first[:id]).to eq(tool_event.id)
    end

    it 'filters by tool_name' do
      create(:tool_event, organization: organization, user: user, tool_name: 'cursor')

      authenticated_get "/api/v1/organizations/#{organization.id}/events",
                        user: user,
                        organization: organization,
                        params: { tool_name: 'claude_code' }

      expect_success
      expect(json_data.length).to eq(1)
      expect(json_data.first[:toolName]).to eq('claude_code')
    end

    it 'filters by event_type' do
      create(:tool_event, organization: organization, user: user, event_type: 'completion')

      authenticated_get "/api/v1/organizations/#{organization.id}/events",
                        user: user,
                        organization: organization,
                        params: { event_type: 'chat' }

      expect_success
      expect(json_data.length).to eq(1)
      expect(json_data.first[:eventType]).to eq('chat')
    end

    it 'returns 403 for non-members' do
      non_member = create(:user)

      authenticated_get "/api/v1/organizations/#{organization.id}/events",
                        user: non_member,
                        organization: organization

      expect_forbidden
    end
  end

  describe 'GET /api/v1/organizations/:organization_id/events/:id' do
    it 'returns the event details' do
      authenticated_get "/api/v1/organizations/#{organization.id}/events/#{tool_event.id}",
                        user: user,
                        organization: organization

      expect_success
      expect(json_data[:id]).to eq(tool_event.id)
      expect(json_data[:inputTokens]).to eq(100)
      expect(json_data[:outputTokens]).to eq(500)
    end

    it "returns attribution 'user' for user-generated events" do
      authenticated_get "/api/v1/organizations/#{organization.id}/events/#{tool_event.id}",
                        user: user,
                        organization: organization

      expect_success
      expect(json_data[:attribution]).to eq("user")
    end

    it "returns attribution 'organization' for reconciled events" do
      org_event = create(:tool_event,
                         organization: organization,
                         user: nil,
                         metadata: { "reconciled" => true })

      authenticated_get "/api/v1/organizations/#{organization.id}/events/#{org_event.id}",
                        user: user,
                        organization: organization

      expect_success
      expect(json_data[:attribution]).to eq("organization")
    end

    it "falls back to workspace_name for project when no project is assigned" do
      ws_event = create(:tool_event,
                        organization: organization,
                        user: user,
                        project: nil,
                        metadata: { "workspace_name" => "engineering-team" })

      authenticated_get "/api/v1/organizations/#{organization.id}/events/#{ws_event.id}",
                        user: user,
                        organization: organization

      expect_success
      expect(json_data[:project][:name]).to eq("engineering-team")
      expect(json_data[:project][:id]).to be_nil
    end

    it "returns project with id and slug when project is assigned" do
      project = create(:project, organization: organization)
      project_event = create(:tool_event,
                             organization: organization,
                             user: user,
                             project: project)

      authenticated_get "/api/v1/organizations/#{organization.id}/events/#{project_event.id}",
                        user: user,
                        organization: organization

      expect_success
      expect(json_data[:project][:id]).to eq(project.id)
      expect(json_data[:project][:name]).to eq(project.name)
      expect(json_data[:project][:slug]).to eq(project.slug)
    end

    it 'returns 404 for non-existent event' do
      authenticated_get "/api/v1/organizations/#{organization.id}/events/nonexistent",
                        user: user,
                        organization: organization

      expect_not_found
    end
  end

  describe 'GET /api/v1/organizations/:organization_id/events/summary' do
    it 'returns summary statistics' do
      authenticated_get "/api/v1/organizations/#{organization.id}/events/summary",
                        user: user,
                        organization: organization

      expect_success
      expect(json_data[:totalEvents]).to eq(1)
      expect(json_data[:totalTokensIn]).to eq(100)
      expect(json_data[:totalTokensOut]).to eq(500)
    end
  end

  describe 'GET /api/v1/organizations/:organization_id/events/unattributed' do
    it 'returns events without user attribution' do
      unattributed_event = create(:tool_event, organization: organization, user: nil)

      authenticated_get "/api/v1/organizations/#{organization.id}/events/unattributed",
                        user: user,
                        organization: organization

      expect_success
      expect(json_data.map { |e| e[:id] }).to include(unattributed_event.id)
      expect(json_data.map { |e| e[:id] }).not_to include(tool_event.id)
    end
  end

  describe 'GET /api/v1/organizations/:organization_id/events/:id/audit_trail' do
    it 'returns the audit trail for an event' do
      audit_log = create(:audit_log, tool_event: tool_event, organization: organization)

      authenticated_get "/api/v1/organizations/#{organization.id}/events/#{tool_event.id}/audit_trail",
                        user: user,
                        organization: organization

      expect_success
      expect(json_data[:id]).to eq(audit_log.id)
    end

    it 'returns null data when no audit trail exists' do
      authenticated_get "/api/v1/organizations/#{organization.id}/events/#{tool_event.id}/audit_trail",
                        user: user,
                        organization: organization

      expect_success
      expect(json_data).to be_nil
    end
  end

  describe 'GET /api/v1/organizations/:organization_id/events/export' do
    let(:other_user) { create(:user) }
    let!(:own_event) do
      create(:tool_event,
             organization: organization,
             user: user,
             tool_name: "claude_code",
             cost_usd: 0.005,
             occurred_at: 1.hour.ago)
    end
    let!(:other_event) do
      create(:tool_event,
             organization: organization,
             user: other_user,
             tool_name: "cursor",
             cost_usd: 0.005,
             occurred_at: 2.hours.ago)
    end

    def export_path(params = {})
      "/api/v1/organizations/#{organization.id}/events/export"
    end

    context "as a member" do
      it "returns a CSV response" do
        authenticated_get export_path, user: user, organization: organization

        expect(response).to have_http_status(:ok)
        expect(response.content_type).to include("text/csv")
      end

      it "includes only the requesting user's events" do
        authenticated_get export_path, user: user, organization: organization

        expect(response.body).to include("claude_code")
        expect(response.body).not_to include("cursor")
      end

      it "does not include user_email in the header row" do
        authenticated_get export_path, user: user, organization: organization

        header_row = response.body.lines.first
        expect(header_row).not_to include("user_email")
      end

      it "sets Content-Disposition: attachment" do
        authenticated_get export_path, user: user, organization: organization

        expect(response.headers["Content-Disposition"]).to include("attachment")
      end

      it "uses the date range in the filename when start_date and end_date are provided" do
        authenticated_get export_path, user: user, organization: organization,
                          params: { start_date: "2026-01-01", end_date: "2026-04-30" }

        expect(response.headers["Content-Disposition"]).to include("db90-events-2026-01-01-2026-04-30.csv")
      end
    end

    context "as an admin" do
      before { membership.update!(role: "admin") }
      after  { membership.update!(role: "member") }

      it "returns all org events" do
        authenticated_get export_path, user: user, organization: organization

        expect(response.body).to include("claude_code")
        expect(response.body).to include("cursor")
      end

      it "includes user_email in the header row" do
        authenticated_get export_path, user: user, organization: organization

        header_row = response.body.lines.first
        expect(header_row).to include("user_email")
      end

      it "does not include model or session_id columns" do
        authenticated_get export_path, user: user, organization: organization

        header_row = response.body.lines.first
        expect(header_row).not_to include("model")
        expect(header_row).not_to include("session_id")
      end
    end

    context "filter params" do
      it "respects tool_name filter" do
        authenticated_get export_path, user: user, organization: organization,
                          params: { tool_name: "claude_code" }

        expect(response.body).to     include("claude_code")
        expect(response.body).not_to include("cursor")
      end

      it "respects risk_level filter (high = cost_usd > 1.0)" do
        high_event = create(:tool_event,
                            organization: organization,
                            user: user,
                            tool_name: "windsurf",
                            cost_usd: 5.0,
                            occurred_at: 30.minutes.ago)

        authenticated_get export_path, user: user, organization: organization,
                          params: { risk_level: "high" }

        expect(response.body).to     include("windsurf")
        expect(response.body).not_to include("claude_code")
      end

      it "respects risk_level filter (critical uses the same bucket as high)" do
        create(:tool_event,
               organization: organization,
               user: user,
               tool_name: "windsurf",
               cost_usd: 5.0,
               occurred_at: 30.minutes.ago)

        authenticated_get export_path, user: user, organization: organization,
                          params: { risk_level: "critical" }

        expect(response.body).to     include("windsurf")
        expect(response.body).not_to include("claude_code")
      end

      it "respects date range filter" do
        old_event = create(:tool_event,
                           organization: organization,
                           user: user,
                           tool_name: "github_copilot",
                           occurred_at: 10.days.ago)

        authenticated_get export_path, user: user, organization: organization,
                          params: { start_date: 3.days.ago.iso8601 }

        expect(response.body).to     include("claude_code")
        expect(response.body).not_to include("github_copilot")
      end

      it "includes events through the end calendar day of end_date" do
        day = Time.zone.today
        create(:tool_event,
               organization: organization,
               user: user,
               tool_name: "cursor",
               cost_usd: 0.005,
               occurred_at: day.beginning_of_day + 23.hours)

        authenticated_get export_path, user: user, organization: organization,
                          params: {
                            start_date: (day - 1.day).to_date.iso8601,
                            end_date: day.to_date.iso8601
                          }

        expect(response.body).to include("cursor")
      end
    end

    it "returns 403 for non-members" do
      non_member = create(:user)

      authenticated_get export_path, user: non_member, organization: organization

      expect_forbidden
    end

    it "returns 202 and a job_id when the result set exceeds 100k rows" do
      allow_any_instance_of(ActiveRecord::Relation).to receive(:count).and_return(100_001)
      allow(ToolEventExportJob).to receive(:perform_async).and_return("fake-job-id")

      authenticated_get export_path, user: user, organization: organization

      expect(response).to have_http_status(:accepted)
      expect(json_response[:job_id]).to eq("fake-job-id")
      expect(response.headers["Link"]).to include("fake-job-id")
    end
  end
end

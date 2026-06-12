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

    it 'filters by multiple comma-separated event_types' do
      chat_event = create(:tool_event, organization: organization, user: user, event_type: 'chat')
      edit_event = create(:tool_event, organization: organization, user: user, event_type: 'edit')
      commit_event = create(:tool_event, organization: organization, user: user, event_type: 'commit')

      authenticated_get "/api/v1/organizations/#{organization.id}/events",
                        user: user,
                        organization: organization,
                        params: { event_type: 'chat,edit' }

      expect_success
      ids = json_data.map { |e| e[:id] }
      expect(ids).to include(chat_event.id, edit_event.id)
      expect(ids).not_to include(commit_event.id)
    end

    it 'returns 403 for non-members' do
      non_member = create(:user)

      authenticated_get "/api/v1/organizations/#{organization.id}/events",
                        user: non_member,
                        organization: organization

      expect_forbidden
    end

    it 'returns only the requesting member\'s events' do
      other_user = create(:user)
      create(:organization_membership, user: other_user, organization: organization, role: 'member')
      other_event = create(:tool_event, organization: organization, user: other_user, tool_name: 'cursor')

      authenticated_get "/api/v1/organizations/#{organization.id}/events",
                        user: user,
                        organization: organization

      expect_success
      ids = json_data.map { |e| e[:id] }
      expect(ids).to include(tool_event.id)
      expect(ids).not_to include(other_event.id)
    end

    context 'as an owner' do
      before { membership.update!(role: 'owner') }

      it 'returns all organization events' do
        other_user = create(:user)
        create(:organization_membership, user: other_user, organization: organization, role: 'member')
        other_event = create(:tool_event, organization: organization, user: other_user, tool_name: 'cursor')

        authenticated_get "/api/v1/organizations/#{organization.id}/events",
                          user: user,
                          organization: organization

        expect_success
        ids = json_data.map { |e| e[:id] }
        expect(ids).to include(tool_event.id, other_event.id)
      end
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

    it "returns 404 when a member requests a reconciled org event they do not own" do
      org_event = create(:tool_event,
                         organization: organization,
                         user: nil,
                         metadata: { "reconciled" => true })

      authenticated_get "/api/v1/organizations/#{organization.id}/events/#{org_event.id}",
                        user: user,
                        organization: organization

      expect_not_found
    end

    it "returns attribution 'organization' for reconciled events when requested by an owner" do
      membership.update!(role: "owner")
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

    it "returns jiraTicket, prNumber, prUrl and branch from metadata (AIX-261)" do
      enriched = create(:tool_event,
                        organization: organization,
                        user: user,
                        event_type: 'commit',
                        metadata: {
                          'jira_ticket' => 'AIX-157',
                          'pr_number' => 42,
                          'pr_url' => 'https://github.com/acme/demo/pull/42',
                          'branch_name' => 'feature/AIX-157-foo'
                        })

      authenticated_get "/api/v1/organizations/#{organization.id}/events/#{enriched.id}",
                        user: user,
                        organization: organization

      expect_success
      expect(json_data[:jiraTicket]).to eq('AIX-157')
      expect(json_data[:prNumber]).to eq(42)
      expect(json_data[:prUrl]).to eq('https://github.com/acme/demo/pull/42')
      expect(json_data[:branch]).to eq('feature/AIX-157-foo')
    end

    it "returns null enrichment fields when metadata has none (AIX-261)" do
      authenticated_get "/api/v1/organizations/#{organization.id}/events/#{tool_event.id}",
                        user: user,
                        organization: organization

      expect_success
      expect(json_data).to have_key(:jiraTicket)
      expect(json_data[:jiraTicket]).to be_nil
      expect(json_data[:prNumber]).to be_nil
      expect(json_data[:prUrl]).to be_nil
      expect(json_data[:branch]).to be_nil
    end

    it "prefers the branch key over branch_name (AIX-261)" do
      enriched = create(:tool_event,
                        organization: organization,
                        user: user,
                        metadata: { 'branch' => 'main', 'branch_name' => 'feature/x' })

      authenticated_get "/api/v1/organizations/#{organization.id}/events/#{enriched.id}",
                        user: user,
                        organization: organization

      expect_success
      expect(json_data[:branch]).to eq('main')
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

    it 'returns 404 when a member requests another member\'s event' do
      other_user = create(:user)
      create(:organization_membership, user: other_user, organization: organization, role: 'member')
      other_event = create(:tool_event, organization: organization, user: other_user, tool_name: 'cursor')

      authenticated_get "/api/v1/organizations/#{organization.id}/events/#{other_event.id}",
                        user: user,
                        organization: organization

      expect_not_found
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
    let(:admin) { create(:user) }
    let!(:admin_membership) { create(:organization_membership, user: admin, organization: organization, role: 'owner') }

    it 'returns events without user attribution for an admin' do
      unattributed_event = create(:tool_event, organization: organization, user: nil)

      authenticated_get "/api/v1/organizations/#{organization.id}/events/unattributed",
                        user: admin,
                        organization: organization

      expect_success
      expect(json_data.map { |e| e[:id] }).to include(unattributed_event.id)
      expect(json_data.map { |e| e[:id] }).not_to include(tool_event.id)
    end

    it 'returns 403 for a plain member' do
      authenticated_get "/api/v1/organizations/#{organization.id}/events/unattributed",
                        user: user,
                        organization: organization

      expect_forbidden
    end

    it 'includes correlation_method and correlation_confidence from metadata' do
      unattributed_event = create(:tool_event,
                                  organization: organization,
                                  user: nil,
                                  metadata: { "correlation_method" => "machine_id", "correlation_confidence" => 0.7 })

      authenticated_get "/api/v1/organizations/#{organization.id}/events/unattributed",
                        user: admin,
                        organization: organization

      expect_success
      event_data = json_data.find { |e| e[:id] == unattributed_event.id }
      expect(event_data[:correlationMethod]).to eq("machine_id")
      expect(event_data[:correlationConfidence]).to eq(0.7)
    end

    it 'filters by min_confidence' do
      low_confidence = create(:tool_event, organization: organization, user: nil,
                              metadata: { "correlation_confidence" => 0.5 })
      high_confidence = create(:tool_event, organization: organization, user: nil,
                               metadata: { "correlation_confidence" => 0.85 })

      authenticated_get "/api/v1/organizations/#{organization.id}/events/unattributed",
                        user: admin,
                        organization: organization,
                        params: { min_confidence: 0.8 }

      expect_success
      ids = json_data.map { |e| e[:id] }
      expect(ids).to include(high_confidence.id)
      expect(ids).not_to include(low_confidence.id)
    end
  end

  describe 'POST /api/v1/organizations/:organization_id/events/:id/attribute' do
    let(:admin) { create(:user) }
    let!(:admin_membership) { create(:organization_membership, user: admin, organization: organization, role: 'owner') }
    let!(:unattributed_event) { create(:tool_event, organization: organization, user: nil) }

    it 'assigns the event to a user when called by an admin' do
      authenticated_post "/api/v1/organizations/#{organization.id}/events/#{unattributed_event.id}/attribute",
                         user: admin,
                         organization: organization,
                         params: { user_id: user.id }

      expect_success
      unattributed_event.reload
      expect(unattributed_event.user_id).to eq(user.id)
      expect(unattributed_event.metadata["correlation_method"]).to eq("manual")
      expect(unattributed_event.metadata["correlation_confidence"]).to eq(1.0)
    end

    it 'returns the updated event in the response' do
      authenticated_post "/api/v1/organizations/#{organization.id}/events/#{unattributed_event.id}/attribute",
                         user: admin,
                         organization: organization,
                         params: { user_id: user.id }

      expect_success
      expect(json_data[:id]).to eq(unattributed_event.id)
      expect(json_data[:correlationMethod]).to eq("manual")
      expect(json_data[:correlationConfidence]).to eq(1.0)
    end

    it 'returns 403 for a non-admin member' do
      authenticated_post "/api/v1/organizations/#{organization.id}/events/#{unattributed_event.id}/attribute",
                         user: user,
                         organization: organization,
                         params: { user_id: user.id }

      expect_forbidden
    end

    it 'returns 404 when user_id is not a member of the organization' do
      outsider = create(:user)

      authenticated_post "/api/v1/organizations/#{organization.id}/events/#{unattributed_event.id}/attribute",
                         user: admin,
                         organization: organization,
                         params: { user_id: outsider.id }

      expect_not_found
    end

    it 'returns 422 when event is already attributed' do
      attributed_event = create(:tool_event, organization: organization, user: user)

      authenticated_post "/api/v1/organizations/#{organization.id}/events/#{attributed_event.id}/attribute",
                         user: admin,
                         organization: organization,
                         params: { user_id: user.id }

      expect(response).to have_http_status(:unprocessable_content)
    end
  end

  describe 'POST /api/v1/organizations/:organization_id/events/attribute_bulk' do
    let(:admin) { create(:user) }
    let!(:admin_membership) { create(:organization_membership, user: admin, organization: organization, role: 'owner') }
    let!(:unattributed_events) { create_list(:tool_event, 3, organization: organization, user: nil) }

    def bulk_attribute_path
      "/api/v1/organizations/#{organization.id}/events/attribute_bulk"
    end

    it 'attributes multiple events to a user' do
      ids = unattributed_events.map(&:id)

      authenticated_post bulk_attribute_path,
                         user: admin,
                         organization: organization,
                         params: { event_ids: ids, user_id: user.id }

      expect_success
      expect(json_data[:updated]).to eq(3)

      unattributed_events.each do |ev|
        ev.reload
        expect(ev.user_id).to eq(user.id)
        expect(ev.metadata["correlation_method"]).to eq("manual")
      end
    end

    it 'silently ignores event_ids beyond the 500 limit' do
      # Build a 502-element list: 3 real IDs at the front, then 499 fake UUIDs.
      # After first(500), the last 2 fake UUIDs are dropped. The 497 fake UUIDs
      # in positions 3-499 cause a count mismatch → 422, proving the slice happened.
      padded_ids = unattributed_events.map(&:id) +
                   Array.new(499) { SecureRandom.uuid }   # 502 total
      extra_id   = SecureRandom.uuid

      authenticated_post bulk_attribute_path,
                         user: admin,
                         organization: organization,
                         params: { event_ids: padded_ids + [ extra_id ], user_id: user.id }

      # Count mismatch because fake UUIDs in positions 3–499 don't exist in the org.
      # The key is the extra_id (position 502) was silently dropped before the DB check.
      expect(response).to have_http_status(:unprocessable_content)
      unattributed_events.each { |ev| expect(ev.reload.user_id).to be_nil }
    end

    it 'skips already-attributed events and returns updated count' do
      attributed = create(:tool_event, organization: organization, user: user)
      mixed_ids  = unattributed_events.map(&:id) + [ attributed.id ]

      authenticated_post bulk_attribute_path,
                         user: admin,
                         organization: organization,
                         params: { event_ids: mixed_ids, user_id: user.id }

      expect_success
      expect(json_data[:updated]).to eq(3)   # only the 3 unattributed ones
      expect(attributed.reload.user_id).to eq(user.id)   # unchanged (already attributed)
    end

    it 'returns 403 for a non-admin member' do
      authenticated_post bulk_attribute_path,
                         user: user,
                         organization: organization,
                         params: { event_ids: unattributed_events.map(&:id), user_id: user.id }

      expect_forbidden
    end

    it 'returns 422 when any event_id does not belong to the organization' do
      other_org = create(:organization)
      foreign_event = create(:tool_event, organization: other_org, user: nil)

      authenticated_post bulk_attribute_path,
                         user: admin,
                         organization: organization,
                         params: { event_ids: [ foreign_event.id ], user_id: user.id }

      expect(response).to have_http_status(:unprocessable_content)
    end

    it 'returns 404 when user_id is not a member of the organization' do
      outsider = create(:user)

      authenticated_post bulk_attribute_path,
                         user: admin,
                         organization: organization,
                         params: { event_ids: unattributed_events.map(&:id), user_id: outsider.id }

      expect_not_found
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

    # Column header row (after optional "Applied filters" preamble rows).
    def csv_table_header_line(body)
      body.each_line.map(&:chomp).find { |line| line.start_with?("occurred_at") }
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

        header_row = csv_table_header_line(response.body)
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

    context "as an owner" do
      before { membership.update!(role: "owner") }

      it "returns all org events" do
        authenticated_get export_path, user: user, organization: organization

        expect(response.body).to include("claude_code")
        expect(response.body).to include("cursor")
      end

      it "includes user_email in the header row" do
        authenticated_get export_path, user: user, organization: organization

        header_row = csv_table_header_line(response.body)
        expect(header_row).to include("user_email")
      end

      it "does not include model or session_id columns" do
        authenticated_get export_path, user: user, organization: organization

        header_row = csv_table_header_line(response.body)
        expect(header_row).not_to include("model")
        expect(header_row).not_to include("session_id")
      end
    end

    context "filter params" do
      it "includes Applied filters preamble rows when query params are present" do
        authenticated_get export_path, user: user, organization: organization,
                          params: { tool_name: "claude_code", risk_level: "high" }

        lines = response.body.each_line.map(&:chomp).reject(&:empty?)
        title_idx = lines.index("Applied filters")
        expect(title_idx).to be_present
        expect(lines[title_idx + 1]).to eq("Tool: claude_code")
        expect(lines[title_idx + 2]).to eq("Risk level: high")
        expect(csv_table_header_line(response.body)).to start_with("occurred_at")
      end

      it "respects tool_name filter" do
        authenticated_get export_path, user: user, organization: organization,
                          params: { tool_name: "claude_code" }

        expect(response.body).to     include("claude_code")
        expect(response.body).not_to include("cursor")
      end

      it "respects risk_level filter (high)" do
        create(:tool_event,
               organization: organization,
               user: user,
               tool_name: "windsurf",
               metadata: { "risk_level" => "high" },
               occurred_at: 30.minutes.ago)

        authenticated_get export_path, user: user, organization: organization,
                          params: { risk_level: "high" }

        expect(response.body).to     include("windsurf")
        expect(response.body).not_to include("claude_code")
      end

      it "respects risk_level filter (critical)" do
        create(:tool_event,
               organization: organization,
               user: user,
               tool_name: "windsurf",
               metadata: { "risk_level" => "critical" },
               occurred_at: 30.minutes.ago)

        authenticated_get export_path, user: user, organization: organization,
                          params: { risk_level: "critical" }

        expect(response.body).to     include("windsurf")
        expect(response.body).not_to include("claude_code")
      end

      it "respects event_type filter" do
        create(:tool_event, organization: organization, user: user, event_type: 'chat',   tool_name: 'claude_code')
        create(:tool_event, organization: organization, user: user, event_type: 'edit',   tool_name: 'claude_code')

        authenticated_get export_path, user: user, organization: organization,
                          params: { event_type: 'chat' }

        # CSV columns: occurred_at,tool_name,event_type,... — no id column
        expect(response.body).to     include(",chat,")
        expect(response.body).not_to include(",edit,")
      end

      it "respects multi-value event_type filter" do
        create(:tool_event, organization: organization, user: user, event_type: 'chat',   tool_name: 'claude_code')
        create(:tool_event, organization: organization, user: user, event_type: 'commit', tool_name: 'claude_code')
        create(:tool_event, organization: organization, user: user, event_type: 'edit',   tool_name: 'claude_code')

        authenticated_get export_path, user: user, organization: organization,
                          params: { event_type: 'chat,commit' }

        expect(response.body).to     include(",chat,")
        expect(response.body).to     include(",commit,")
        expect(response.body).not_to include(",edit,")
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

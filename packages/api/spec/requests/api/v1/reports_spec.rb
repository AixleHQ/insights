# frozen_string_literal: true

require "rails_helper"

RSpec.describe "Api::V1::Reports", type: :request do
  let(:owner)        { create(:user) }
  let(:member_user)  { create(:user) }
  let(:organization) { create(:organization) }
  let(:project)      { create(:project, organization: organization) }

  let!(:owner_membership)  { create(:organization_membership, user: owner,       organization: organization, role: "owner") }
  let!(:member_membership) { create(:organization_membership, user: member_user, organization: organization, role: "member") }

  let!(:event_owner) do
    create(:tool_event,
           organization: organization,
           user: owner,
           tool_name: "claude_code",
           tokens_in: 100,
           tokens_out: 200,
           cost_usd: 0.05,
           occurred_at: 1.day.ago)
  end

  let!(:event_member) do
    create(:tool_event,
           organization: organization,
           user: member_user,
           tool_name: "cursor",
           tokens_in: 50,
           tokens_out: 150,
           cost_usd: 0.02,
           occurred_at: 2.days.ago)
  end

  let(:base_path) { "/api/v1/organizations/#{organization.id}/reports/export" }

  describe "GET /api/v1/organizations/:organization_id/reports/export" do
    context "authorization" do
      it "returns 401 for unauthenticated requests" do
        get base_path, params: { report_type: "cost_by_tool" }
        expect(response).to have_http_status(:unauthorized)
      end

      it "returns 403 for org members (non-owner)" do
        authenticated_get base_path,
                          user: member_user,
                          organization: organization,
                          params: { report_type: "cost_by_tool" }
        expect_forbidden
      end

      it "allows org owners" do
        authenticated_get base_path,
                          user: owner,
                          organization: organization,
                          params: { report_type: "cost_by_tool" }
        expect(response).to have_http_status(:ok)
      end
    end

    context "parameter validation" do
      it "returns 422 when report_type is missing" do
        authenticated_get base_path, user: owner, organization: organization
        expect_unprocessable
        expect(json_response[:message]).to include("report_type")
      end

      it "returns 422 for an invalid report_type" do
        authenticated_get base_path,
                          user: owner,
                          organization: organization,
                          params: { report_type: "invalid_type" }
        expect_unprocessable
      end

      it "returns 422 for an invalid format" do
        authenticated_get base_path,
                          user: owner,
                          organization: organization,
                          params: { report_type: "cost_by_tool", format: "xml" }
        expect_unprocessable
      end

      it "returns 422 for an invalid group_by" do
        authenticated_get base_path,
                          user: owner,
                          organization: organization,
                          params: { report_type: "cost_by_tool", group_by: "hour" }
        expect_unprocessable
      end
    end

    context "JSON format (default)" do
      it "returns JSON data by default" do
        authenticated_get base_path,
                          user: owner,
                          organization: organization,
                          params: { report_type: "cost_by_tool" }
        expect(response).to have_http_status(:ok)
        expect(response.content_type).to include("application/json")
        expect(json_response[:data]).to be_an(Array)
      end

      it "returns JSON when format=json is explicit" do
        authenticated_get base_path,
                          user: owner,
                          organization: organization,
                          params: { report_type: "cost_by_tool", format: "json" }
        expect(response).to have_http_status(:ok)
        expect(json_response[:data]).to be_an(Array)
      end
    end

    context "CSV format" do
      it "returns a CSV file download" do
        authenticated_get base_path,
                          user: owner,
                          organization: organization,
                          params: { report_type: "cost_by_tool", format: "csv" }
        expect(response).to have_http_status(:ok)
        expect(response.content_type).to include("text/csv")
        expect(response.headers["Content-Disposition"]).to include("attachment")
      end

      it "includes correct headers for cost_by_tool" do
        authenticated_get base_path,
                          user: owner,
                          organization: organization,
                          params: { report_type: "cost_by_tool", format: "csv" }
        header_line = response.body.lines.first.chomp
        expect(header_line).to eq("tool_name,total_cost_usd,total_tokens,event_count")
      end

      it "includes correct headers for token_by_user" do
        authenticated_get base_path,
                          user: owner,
                          organization: organization,
                          params: { report_type: "token_by_user", format: "csv" }
        header_line = response.body.lines.first.chomp
        expect(header_line).to eq("user_id,user_name,input_tokens,output_tokens,total_tokens")
      end
    end

    context "report_type: cost_by_user" do
      it "returns rows with the correct columns" do
        authenticated_get base_path,
                          user: owner,
                          organization: organization,
                          params: { report_type: "cost_by_user" }
        row = json_response[:data].first
        expect(row.keys.map(&:to_s)).to include("user_id", "user_name", "total_cost_usd", "total_tokens", "tool_count")
      end

      it "aggregates cost and tokens per user" do
        authenticated_get base_path,
                          user: owner,
                          organization: organization,
                          params: { report_type: "cost_by_user" }
        rows = json_response[:data]
        owner_row = rows.find { |r| r[:user_id] == owner.id || r["user_id"] == owner.id }
        expect(owner_row).to be_present
        expect(owner_row[:total_cost_usd].to_f).to be_within(0.001).of(0.05)
      end
    end

    context "report_type: cost_by_project" do
      let!(:event_with_project) do
        create(:tool_event,
               organization: organization,
               user: owner,
               project: project,
               tool_name: "claude_code",
               cost_usd: 0.10,
               occurred_at: 1.day.ago)
      end

      it "returns rows with the correct columns" do
        authenticated_get base_path,
                          user: owner,
                          organization: organization,
                          params: { report_type: "cost_by_project" }
        row = json_response[:data].first
        expect(row.keys.map(&:to_s)).to include("project_id", "project_name", "total_cost_usd", "total_tokens")
      end

      it "only includes events with a project (excludes nil)" do
        authenticated_get base_path,
                          user: owner,
                          organization: organization,
                          params: { report_type: "cost_by_project" }
        rows = json_response[:data]
        expect(rows.length).to eq(1)
        expect(rows.first[:project_id].to_s).to eq(project.id.to_s)
      end
    end

    context "report_type: cost_by_tool" do
      it "returns rows with the correct columns" do
        authenticated_get base_path,
                          user: owner,
                          organization: organization,
                          params: { report_type: "cost_by_tool" }
        row = json_response[:data].first
        expect(row.keys.map(&:to_s)).to include("tool_name", "total_cost_usd", "total_tokens", "event_count")
      end

      it "aggregates across tools" do
        authenticated_get base_path,
                          user: owner,
                          organization: organization,
                          params: { report_type: "cost_by_tool" }
        tool_names = json_response[:data].map { |r| r[:tool_name] }
        expect(tool_names).to include("claude_code", "cursor")
      end
    end

    context "report_type: token_by_user" do
      it "returns rows with the correct columns" do
        authenticated_get base_path,
                          user: owner,
                          organization: organization,
                          params: { report_type: "token_by_user" }
        row = json_response[:data].first
        expect(row.keys.map(&:to_s)).to include("user_id", "user_name", "input_tokens", "output_tokens", "total_tokens")
      end
    end

    context "report_type: token_by_tool" do
      it "returns rows with the correct columns" do
        authenticated_get base_path,
                          user: owner,
                          organization: organization,
                          params: { report_type: "token_by_tool" }
        row = json_response[:data].first
        expect(row.keys.map(&:to_s)).to include("tool_name", "input_tokens", "output_tokens", "total_tokens")
      end
    end

    context "group_by" do
      it "adds a period column when group_by=day" do
        authenticated_get base_path,
                          user: owner,
                          organization: organization,
                          params: { report_type: "cost_by_tool", group_by: "day" }
        row = json_response[:data].first
        expect(row.keys.map(&:to_s)).to include("period")
        expect(row[:period]).to be_present
      end

      it "adds a period column when group_by=week" do
        authenticated_get base_path,
                          user: owner,
                          organization: organization,
                          params: { report_type: "cost_by_tool", group_by: "week" }
        row = json_response[:data].first
        expect(row.keys.map(&:to_s)).to include("period")
      end

      it "adds a period column when group_by=month" do
        authenticated_get base_path,
                          user: owner,
                          organization: organization,
                          params: { report_type: "token_by_tool", group_by: "month" }
        row = json_response[:data].first
        expect(row.keys.map(&:to_s)).to include("period")
      end

      it "includes period in CSV headers when group_by is set" do
        authenticated_get base_path,
                          user: owner,
                          organization: organization,
                          params: { report_type: "cost_by_tool", group_by: "day", format: "csv" }
        header_line = response.body.lines.first.chomp
        expect(header_line).to include("period")
      end
    end

    context "project_id filter" do
      let!(:event_with_project) do
        create(:tool_event,
               organization: organization,
               user: owner,
               project: project,
               tool_name: "windsurf",
               cost_usd: 0.07,
               occurred_at: 1.day.ago)
      end

      it "scopes results to the given project" do
        authenticated_get base_path,
                          user: owner,
                          organization: organization,
                          params: { report_type: "cost_by_tool", project_id: project.id }
        tool_names = json_response[:data].map { |r| r[:tool_name] }
        expect(tool_names).to include("windsurf")
        expect(tool_names).not_to include("cursor")
      end
    end

    context "date range defaults" do
      it "returns all-time data without from/to params" do
        authenticated_get base_path,
                          user: owner,
                          organization: organization,
                          params: { report_type: "cost_by_tool" }
        expect(response).to have_http_status(:ok)
        expect(json_response[:data]).to be_an(Array)
        expect(json_response[:data]).not_to be_empty
      end
    end

    context "users with events outside the default 30-day window" do
      let!(:old_user) { create(:user) }
      let!(:old_membership) do
        create(:organization_membership, user: old_user, organization: organization, role: "member")
      end
      let!(:old_event) do
        create(:tool_event,
               organization: organization,
               user: old_user,
               tool_name: "claude_code",
               tokens_in: 500,
               tokens_out: 1000,
               cost_usd: 0.75,
               occurred_at: 45.days.ago)
      end

      it "includes users whose events predate 30 days ago when no date range is given" do
        authenticated_get base_path,
                          user: owner,
                          organization: organization,
                          params: { report_type: "cost_by_user" }
        user_ids = json_response[:data].map { |r| r[:user_id] }
        expect(user_ids).to include(old_user.id)
      end

      it "includes the correct cost for the old user" do
        authenticated_get base_path,
                          user: owner,
                          organization: organization,
                          params: { report_type: "cost_by_user" }
        row = json_response[:data].find { |r| r[:user_id] == old_user.id }
        expect(row[:total_cost_usd].to_f).to be_within(0.001).of(0.75)
      end

      it "excludes the old user when an explicit date range excludes their events" do
        authenticated_get base_path,
                          user: owner,
                          organization: organization,
                          params: {
                            report_type: "cost_by_user",
                            from: 30.days.ago.iso8601,
                            to: Time.current.iso8601
                          }
        user_ids = json_response[:data].map { |r| r[:user_id] }
        expect(user_ids).not_to include(old_user.id)
      end
    end
  end
end

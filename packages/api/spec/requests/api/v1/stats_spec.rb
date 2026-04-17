# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Api::V1::Stats', type: :request do
  let(:user) { create(:user) }
  let(:organization) { create(:organization) }
  let!(:membership) { create(:organization_membership, user: user, organization: organization, role: 'member') }

  before do
    # Create some tool events for stats
    create(:tool_event,
           organization: organization,
           user: user,
           tool_name: 'claude_code',
           event_type: 'chat',
           tokens_in: 100,
           tokens_out: 500,
           cost_usd: 0.05,
           occurred_at: Time.current)

    create(:tool_event,
           organization: organization,
           user: user,
           tool_name: 'cursor',
           event_type: 'completion',
           tokens_in: 50,
           tokens_out: 200,
           cost_usd: 0.02,
           occurred_at: 1.hour.ago)
  end

  describe 'GET /api/v1/organizations/:organization_id/stats/overview' do
    it 'returns overview statistics' do
      authenticated_get "/api/v1/organizations/#{organization.id}/stats/overview",
                        user: user,
                        organization: organization

      expect_success
      # Overview returns flat structure with snake_case keys
      expect(json_response[:total_events]).to be_a(Integer)
      expect(json_response[:total_cost_usd]).to be_a(Numeric)
      expect(json_response[:active_users]).to be_a(Integer)
      expect(json_response[:high_risk_events]).to be_a(Integer)
      expect(json_response[:events_change_percent]).to be_a(Numeric)
      expect(json_response[:cost_change_percent]).to be_a(Numeric)
    end

    it 'returns 403 for non-members' do
      non_member = create(:user)

      authenticated_get "/api/v1/organizations/#{organization.id}/stats/overview",
                        user: non_member,
                        organization: organization

      expect_forbidden
    end
  end

  describe 'GET /api/v1/organizations/:organization_id/stats/hourly' do
    it 'returns hourly aggregated statistics' do
      authenticated_get "/api/v1/organizations/#{organization.id}/stats/hourly",
                        user: user,
                        organization: organization

      expect_success
      # Response is { data: { hourly: [...], timeRange: {...} } }
      expect(json_data[:hourly]).to be_an(Array)
      expect(json_data[:timeRange]).to have_key(:start)
      expect(json_data[:timeRange]).to have_key(:end)
    end
  end

  describe 'GET /api/v1/organizations/:organization_id/stats/daily' do
    it 'returns daily aggregated statistics' do
      authenticated_get "/api/v1/organizations/#{organization.id}/stats/daily",
                        user: user,
                        organization: organization

      expect_success
      # Response is { data: [...], tool_breakdown: [...] }
      expect(json_response[:data]).to be_an(Array)
      expect(json_response[:tool_breakdown]).to be_an(Array)
    end

    it 'filters by date range' do
      authenticated_get "/api/v1/organizations/#{organization.id}/stats/daily",
                        user: user,
                        organization: organization,
                        params: {
                          start_date: 7.days.ago.iso8601,
                          end_date: Time.current.iso8601
                        }

      expect_success
    end
  end

  describe 'GET /api/v1/organizations/:organization_id/stats/daily_by_tool' do
    before do
      # Create events for multiple tools over multiple days
      create(:tool_event, organization: organization, user: user, tool_name: 'claude_code', occurred_at: Time.current)
      create(:tool_event, organization: organization, user: user, tool_name: 'claude_code', occurred_at: Time.current)
      create(:tool_event, organization: organization, user: user, tool_name: 'cursor', occurred_at: Time.current)
      create(:tool_event, organization: organization, user: user, tool_name: 'github_copilot', occurred_at: 1.day.ago)
      create(:tool_event, organization: organization, user: user, tool_name: 'aider', occurred_at: 1.day.ago)
    end

    it 'returns daily data grouped by tool' do
      authenticated_get "/api/v1/organizations/#{organization.id}/stats/daily_by_tool",
                        user: user,
                        organization: organization

      expect_success
      expect(json_response[:data]).to be_an(Array)
      expect(json_response[:tools]).to be_an(Array)
    end

    it 'includes top 3 tools plus Other' do
      authenticated_get "/api/v1/organizations/#{organization.id}/stats/daily_by_tool",
                        user: user,
                        organization: organization

      expect_success
      # Should have top 3 tools + 'Other'
      expect(json_response[:tools].length).to be <= 4
      expect(json_response[:tools]).to include('Other')
    end

    it 'returns data with tool counts per day' do
      authenticated_get "/api/v1/organizations/#{organization.id}/stats/daily_by_tool",
                        user: user,
                        organization: organization

      expect_success
      # Each day should have a date and counts for each tool
      day_data = json_response[:data].first
      expect(day_data).to have_key(:date)
    end

    it 'accepts days parameter' do
      authenticated_get "/api/v1/organizations/#{organization.id}/stats/daily_by_tool",
                        user: user,
                        organization: organization,
                        params: { days: 7 }

      expect_success
    end
  end

  describe 'GET /api/v1/organizations/:organization_id/stats/tools/:tool_name/overview' do
    let(:frozen_time) { Time.zone.parse("2026-04-15 12:00:00") }
    let(:user2) { create(:user) }

    before do
      travel_to(frozen_time) do
        # Current month — cursor events (2 attributed users + 1 nil user)
        create(:tool_event, organization: organization, user: user,
               tool_name: "cursor", tokens_in: 100, tokens_out: 200,
               cost_usd: 10.0, occurred_at: Time.current)
        create(:tool_event, organization: organization, user: user2,
               tool_name: "cursor", tokens_in: 50, tokens_out: 100,
               cost_usd: 5.0, occurred_at: 1.day.ago)
        create(:tool_event, organization: organization, user: nil,
               tool_name: "cursor", tokens_in: 0, tokens_out: 0,
               cost_usd: 1.0, occurred_at: Time.current)

        # Previous month — cursor (1 event)
        create(:tool_event, organization: organization, user: user,
               tool_name: "cursor", tokens_in: 80, tokens_out: 160,
               cost_usd: 6.0, occurred_at: 1.month.ago.beginning_of_month + 1.day)

        # Different tool — must NOT appear in cursor results
        create(:tool_event, organization: organization, user: user,
               tool_name: "openrouter_api", tokens_in: 999, tokens_out: 999,
               cost_usd: 99.0, occurred_at: Time.current)
      end
    end

    it "returns 200 with correct shape for cursor" do
      travel_to(frozen_time) do
        authenticated_get "/api/v1/organizations/#{organization.id}/stats/tools/cursor/overview",
                          user: user, organization: organization
      end

      expect_success
      expect(json_response[:tool]).to eq("cursor")
      expect(json_response[:total_events]).to eq(3)
      expect(json_response[:total_cost_usd]).to eq(16.0)
      expect(json_response[:total_tokens_in]).to eq(150)
      expect(json_response[:total_tokens_out]).to eq(300)
      expect(json_response[:active_users]).to eq(2)
      expect(json_response[:events_change_pct]).to eq(200.0)
      expect(json_response[:cost_change_pct]).to be_a(Numeric)
    end

    it "returns 200 with correct shape for openrouter_api" do
      travel_to(frozen_time) do
        authenticated_get "/api/v1/organizations/#{organization.id}/stats/tools/openrouter_api/overview",
                          user: user, organization: organization
      end

      expect_success
      expect(json_response[:tool]).to eq("openrouter_api")
      expect(json_response[:total_events]).to eq(1)
      expect(json_response[:total_cost_usd]).to eq(99.0)
    end

    it "excludes null user_ids from active_users" do
      travel_to(frozen_time) do
        authenticated_get "/api/v1/organizations/#{organization.id}/stats/tools/cursor/overview",
                          user: user, organization: organization
      end

      expect_success
      expect(json_response[:active_users]).to eq(2)
    end

    it "returns 0 for change percentages when no prior-month data exists" do
      new_org = create(:organization)
      create(:organization_membership, user: user, organization: new_org, role: "member")

      travel_to(frozen_time) do
        create(:tool_event, organization: new_org, user: user,
               tool_name: "cursor", occurred_at: Time.current)

        authenticated_get "/api/v1/organizations/#{new_org.id}/stats/tools/cursor/overview",
                          user: user, organization: new_org
      end

      expect_success
      expect(json_response[:events_change_pct]).to eq(0)
      expect(json_response[:cost_change_pct]).to eq(0)
    end

    it "returns 403 for non-members" do
      non_member = create(:user)

      travel_to(frozen_time) do
        authenticated_get "/api/v1/organizations/#{organization.id}/stats/tools/cursor/overview",
                          user: non_member, organization: organization
      end

      expect_forbidden
    end
  end

  describe 'GET /api/v1/organizations/:organization_id/stats/tools/:tool_name/*' do
    describe 'set_tool_scope before_action' do
      it 'returns 422 with error message for an unknown tool' do
        authenticated_get "/api/v1/organizations/#{organization.id}/stats/tools/invalid/overview",
                          user: user,
                          organization: organization

        expect(response).to have_http_status(:unprocessable_entity)
        expect(json_response[:error]).to eq('Unknown tool: invalid')
      end

      it 'reaches the action for a valid tool (cursor)' do
        authenticated_get "/api/v1/organizations/#{organization.id}/stats/tools/cursor/overview",
                          user: user,
                          organization: organization

        expect_success
      end

      it 'reaches the action for a valid tool (openrouter_api)' do
        authenticated_get "/api/v1/organizations/#{organization.id}/stats/tools/openrouter_api/overview",
                          user: user,
                          organization: organization

        expect_success
      end
    end

    %w[models users daily event_types].each do |endpoint|
      it "routes and authorizes GET .../tools/:tool_name/#{endpoint}" do
        authenticated_get "/api/v1/organizations/#{organization.id}/stats/tools/cursor/#{endpoint}",
                          user: user,
                          organization: organization

        expect_success
      end
    end
  end

  describe 'GET /api/v1/organizations/:organization_id/stats/heatmap' do
    before do
      # Create events across different days
      create(:tool_event, organization: organization, user: user, occurred_at: Time.current)
      create(:tool_event, organization: organization, user: user, occurred_at: 1.day.ago)
      create(:tool_event, organization: organization, user: user, occurred_at: 1.day.ago)
      create(:tool_event, organization: organization, user: user, occurred_at: 1.week.ago)
    end

    it 'returns heatmap data for the past year' do
      authenticated_get "/api/v1/organizations/#{organization.id}/stats/heatmap",
                        user: user,
                        organization: organization

      expect_success
      expect(json_response).to be_an(Array)
    end

    it 'returns data with date and count' do
      authenticated_get "/api/v1/organizations/#{organization.id}/stats/heatmap",
                        user: user,
                        organization: organization

      expect_success
      expect(json_response.first).to have_key(:date)
      expect(json_response.first).to have_key(:count)
    end
  end
end

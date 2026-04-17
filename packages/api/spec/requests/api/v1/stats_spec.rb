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

  describe 'GET /api/v1/organizations/:organization_id/stats/tools/:tool_name/models' do
    let(:frozen_time) { Time.zone.parse("2026-04-15 12:00:00") }

    before do
      travel_to(frozen_time) do
        # Two events with a known model
        create(:tool_event, organization: organization, user: user,
               tool_name: "openrouter_api", model: "claude-3-5-sonnet-20241022",
               tokens_in: 100, tokens_out: 200, cost_usd: 1.0,
               occurred_at: Time.current)
        create(:tool_event, organization: organization, user: user,
               tool_name: "openrouter_api", model: "claude-3-5-sonnet-20241022",
               tokens_in: 50, tokens_out: 100, cost_usd: 0.5,
               occurred_at: 1.day.ago)

        # One event with a different model (fewer events — should sort second)
        create(:tool_event, organization: organization, user: user,
               tool_name: "openrouter_api", model: "gpt-4o",
               tokens_in: 300, tokens_out: 600, cost_usd: 2.0,
               occurred_at: Time.current)

        # Event with null model — must be excluded
        create(:tool_event, organization: organization, user: user,
               tool_name: "openrouter_api", model: nil,
               tokens_in: 10, tokens_out: 20, cost_usd: 0.1,
               occurred_at: Time.current)

        # Event for a different tool — must not appear
        create(:tool_event, organization: organization, user: user,
               tool_name: "cursor", model: "gpt-4o",
               tokens_in: 999, tokens_out: 999, cost_usd: 99.0,
               occurred_at: Time.current)
      end
    end

    it "returns correct top-level shape" do
      travel_to(frozen_time) do
        authenticated_get "/api/v1/organizations/#{organization.id}/stats/tools/openrouter_api/models",
                          user: user, organization: organization
      end

      expect_success
      expect(json_response[:tool]).to eq("openrouter_api")
      expect(json_response[:timeRange]).to have_key(:start)
      expect(json_response[:timeRange]).to have_key(:end)
      expect(json_response[:models]).to be_an(Array)
    end

    it "returns model entries sorted by eventCount descending" do
      travel_to(frozen_time) do
        authenticated_get "/api/v1/organizations/#{organization.id}/stats/tools/openrouter_api/models",
                          user: user, organization: organization
      end

      expect_success
      counts = json_response[:models].map { |m| m[:eventCount] }
      expect(counts).to eq(counts.sort.reverse)
      expect(json_response[:models].first[:name]).to eq("claude-3-5-sonnet-20241022")
    end

    it "excludes null model entries" do
      travel_to(frozen_time) do
        authenticated_get "/api/v1/organizations/#{organization.id}/stats/tools/openrouter_api/models",
                          user: user, organization: organization
      end

      expect_success
      names = json_response[:models].map { |m| m[:name] }
      expect(names).not_to include(nil)
    end

    it "returns aggregated token and cost fields per model" do
      travel_to(frozen_time) do
        authenticated_get "/api/v1/organizations/#{organization.id}/stats/tools/openrouter_api/models",
                          user: user, organization: organization
      end

      expect_success
      sonnet = json_response[:models].find { |m| m[:name] == "claude-3-5-sonnet-20241022" }
      expect(sonnet[:eventCount]).to eq(2)
      expect(sonnet[:tokensIn]).to eq(150)
      expect(sonnet[:tokensOut]).to eq(300)
      expect(sonnet[:costUsd].to_f).to be_within(0.001).of(1.5)
    end

    it "includes pricing fields for known models" do
      travel_to(frozen_time) do
        authenticated_get "/api/v1/organizations/#{organization.id}/stats/tools/openrouter_api/models",
                          user: user, organization: organization
      end

      expect_success
      sonnet = json_response[:models].find { |m| m[:name] == "claude-3-5-sonnet-20241022" }
      expect(sonnet[:price_per_million_input]).to be_a(Numeric)
      expect(sonnet[:price_per_million_output]).to be_a(Numeric)
    end

    it "scopes results to the requested tool only" do
      travel_to(frozen_time) do
        authenticated_get "/api/v1/organizations/#{organization.id}/stats/tools/openrouter_api/models",
                          user: user, organization: organization
      end

      expect_success
      # cursor's gpt-4o event must not inflate openrouter_api counts
      gpt4o = json_response[:models].find { |m| m[:name] == "gpt-4o" }
      expect(gpt4o[:eventCount]).to eq(1)
    end

    it "supports ?days= param" do
      travel_to(frozen_time) do
        authenticated_get "/api/v1/organizations/#{organization.id}/stats/tools/openrouter_api/models",
                          user: user, organization: organization,
                          params: { days: 1 }
      end

      expect_success
      # Only events from the last 1 day — the 1.day.ago event may fall outside
      sonnet = json_response[:models].find { |m| m[:name] == "claude-3-5-sonnet-20241022" }
      expect(sonnet[:eventCount]).to be >= 1
    end

    it "supports ?start_date= / ?end_date= params" do
      travel_to(frozen_time) do
        authenticated_get "/api/v1/organizations/#{organization.id}/stats/tools/openrouter_api/models",
                          user: user, organization: organization,
                          params: {
                            start_date: 7.days.ago.iso8601,
                            end_date: Time.current.iso8601
                          }
      end

      expect_success
      expect(json_response[:models]).to be_an(Array)
    end

    it "returns 403 for non-members" do
      non_member = create(:user)

      travel_to(frozen_time) do
        authenticated_get "/api/v1/organizations/#{organization.id}/stats/tools/openrouter_api/models",
                          user: non_member, organization: organization
      end

      expect_forbidden
    end
  end

  describe 'GET /api/v1/organizations/:organization_id/stats/tools/:tool_name/users' do
    let(:frozen_time) { Time.zone.parse("2026-04-15 12:00:00") }
    let(:user2) { create(:user) }

    before do
      travel_to(frozen_time) do
        # user — higher token count (should rank first)
        create(:tool_event, organization: organization, user: user,
               tool_name: "cursor", tokens_in: 300, tokens_out: 700,
               cost_usd: 5.0, occurred_at: Time.current)
        # user2 — lower token count (should rank second)
        create(:tool_event, organization: organization, user: user2,
               tool_name: "cursor", tokens_in: 50, tokens_out: 100,
               cost_usd: 1.0, occurred_at: Time.current)
        # unattributed — must be excluded from results
        create(:tool_event, organization: organization, user: nil,
               tool_name: "cursor", tokens_in: 999, tokens_out: 999,
               cost_usd: 99.0, occurred_at: Time.current)
        # different tool — must be excluded from results
        create(:tool_event, organization: organization, user: user,
               tool_name: "openrouter_api", tokens_in: 999, tokens_out: 999,
               cost_usd: 99.0, occurred_at: Time.current)
      end
    end

    it "returns correct top-level shape" do
      travel_to(frozen_time) do
        authenticated_get "/api/v1/organizations/#{organization.id}/stats/tools/cursor/users",
                          user: user, organization: organization
      end

      expect_success
      expect(json_response[:tool]).to eq("cursor")
      expect(json_response[:timeRange]).to have_key(:start)
      expect(json_response[:timeRange]).to have_key(:end)
      expect(json_response[:users]).to be_an(Array)
    end

    it "returns correct per-user fields" do
      travel_to(frozen_time) do
        authenticated_get "/api/v1/organizations/#{organization.id}/stats/tools/cursor/users",
                          user: user, organization: organization
      end

      expect_success
      entry = json_response[:users].first
      expect(entry).to have_key(:userId)
      expect(entry).to have_key(:name)
      expect(entry).to have_key(:email)
      expect(entry).to have_key(:eventCount)
      expect(entry).to have_key(:totalTokens)
      expect(entry).to have_key(:costUsd)
    end

    it "sorts users by totalTokens descending" do
      travel_to(frozen_time) do
        authenticated_get "/api/v1/organizations/#{organization.id}/stats/tools/cursor/users",
                          user: user, organization: organization
      end

      expect_success
      tokens = json_response[:users].map { |u| u[:totalTokens] }
      expect(tokens).to eq(tokens.sort.reverse)
      expect(json_response[:users].first[:userId]).to eq(user.id)
    end

    it "excludes events with null user_id" do
      travel_to(frozen_time) do
        authenticated_get "/api/v1/organizations/#{organization.id}/stats/tools/cursor/users",
                          user: user, organization: organization
      end

      expect_success
      user_ids = json_response[:users].map { |u| u[:userId] }
      expect(user_ids).not_to include(nil)
      expect(json_response[:users].length).to eq(2)
    end

    it "scopes results to the requested tool only" do
      travel_to(frozen_time) do
        authenticated_get "/api/v1/organizations/#{organization.id}/stats/tools/cursor/users",
                          user: user, organization: organization
      end

      expect_success
      top = json_response[:users].find { |u| u[:userId] == user.id }
      # cursor events only: 300+700 = 1000 tokens, not inflated by openrouter_api
      expect(top[:totalTokens]).to eq(1000)
    end

    it "respects ?limit param" do
      travel_to(frozen_time) do
        authenticated_get "/api/v1/organizations/#{organization.id}/stats/tools/cursor/users",
                          user: user, organization: organization,
                          params: { limit: 1 }
      end

      expect_success
      expect(json_response[:users].length).to eq(1)
    end

    it "clamps ?limit to a maximum of 100" do
      travel_to(frozen_time) do
        authenticated_get "/api/v1/organizations/#{organization.id}/stats/tools/cursor/users",
                          user: user, organization: organization,
                          params: { limit: 999 }
      end

      expect_success
      expect(json_response[:users].length).to be <= 100
    end

    it "supports ?days param" do
      travel_to(frozen_time) do
        authenticated_get "/api/v1/organizations/#{organization.id}/stats/tools/cursor/users",
                          user: user, organization: organization,
                          params: { days: 7 }
      end

      expect_success
      expect(json_response[:users]).to be_an(Array)
    end

    it "supports ?start_date= / ?end_date= params" do
      travel_to(frozen_time) do
        authenticated_get "/api/v1/organizations/#{organization.id}/stats/tools/cursor/users",
                          user: user, organization: organization,
                          params: {
                            start_date: 7.days.ago.iso8601,
                            end_date: Time.current.iso8601
                          }
      end

      expect_success
      expect(json_response[:users]).to be_an(Array)
    end

    it "returns 403 for non-members" do
      non_member = create(:user)

      travel_to(frozen_time) do
        authenticated_get "/api/v1/organizations/#{organization.id}/stats/tools/cursor/users",
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

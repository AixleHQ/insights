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
      expect(json_response[:risk_alerts]).to be_a(Integer)
      expect(json_response[:events_change_percent]).to be_a(Numeric)
      expect(json_response[:cost_change_percent]).to be_a(Numeric)
    end

    it 'scopes by project_id when provided' do
      project = create(:project, organization: organization)
      create(:tool_event, organization: organization, project: project, user: user,
             tool_name: 'claude_code', cost_usd: 1.5, occurred_at: Time.current)

      authenticated_get "/api/v1/organizations/#{organization.id}/stats/overview",
                        user: user,
                        organization: organization,
                        params: { project_id: project.id }

      expect_success
      expect(json_response[:risk_alerts]).to be_a(Integer)
    end

    it 'returns 404 for project_id belonging to another org' do
      other_org = create(:organization)
      other_project = create(:project, organization: other_org)

      authenticated_get "/api/v1/organizations/#{organization.id}/stats/overview",
                        user: user,
                        organization: organization,
                        params: { project_id: other_project.id }

      expect(response).to have_http_status(:not_found)
    end

    it 'filters to events with no project when project_id=none' do
      project = create(:project, organization: organization)
      create(:tool_event, organization: organization, project: project, user: user,
             tool_name: 'claude_code', cost_usd: 99.0, occurred_at: Time.current)

      authenticated_get "/api/v1/organizations/#{organization.id}/stats/overview",
                        user: user,
                        organization: organization,
                        params: { project_id: 'none' }

      expect_success
      # The 2 events from before-block have no project; the project-scoped event above must not appear
      expect(json_response[:total_events]).to eq(2)
    end

    it 'treats whitespace-only project_id as blank' do
      authenticated_get "/api/v1/organizations/#{organization.id}/stats/overview",
                        user: user,
                        organization: organization,
                        params: { project_id: "   " }

      expect_success
      expect(json_response[:total_events]).to be >= 1
    end

    it 'does not raise for array-form project_id and scopes by first value' do
      project = create(:project, organization: organization)
      create(:tool_event, organization: organization, project: project, user: user,
             tool_name: 'claude_code', cost_usd: 3.0, occurred_at: Time.current)

      authenticated_get "/api/v1/organizations/#{organization.id}/stats/overview",
                        user: user,
                        organization: organization,
                        params: { project_id: [ project.id ] }

      expect_success
      expect(json_response[:total_events]).to eq(1)
    end

    it 'returns 403 for non-members' do
      non_member = create(:user)

      authenticated_get "/api/v1/organizations/#{organization.id}/stats/overview",
                        user: non_member,
                        organization: organization

      expect_forbidden
    end

    it 'defaults overview to current calendar month when month is not provided' do
      org = create(:organization)
      member = create(:user)
      create(:organization_membership, user: member, organization: org, role: "member")

      travel_to(Time.zone.parse("2026-03-10 12:00:00")) do
        create(:tool_event, organization: org, user: member, occurred_at: Time.zone.parse("2026-02-20 09:00:00"))
        create(:tool_event, organization: org, user: member, occurred_at: Time.zone.parse("2026-03-05 09:00:00"))

        authenticated_get "/api/v1/organizations/#{org.id}/stats/overview",
                          user: member,
                          organization: org
      end

      expect_success
      expect(json_response[:total_events]).to eq(1)
    end

    it 'returns 400 for invalid month format' do
      authenticated_get "/api/v1/organizations/#{organization.id}/stats/overview",
                        user: user,
                        organization: organization,
                        params: { month: "2026-13" }

      expect(response).to have_http_status(:bad_request)
      expect(json_response[:message]).to eq("Invalid month format — expected YYYY-MM")
    end

    context 'with ?month= param' do
      it 'scopes stats to the given calendar month' do
        create(:tool_event, organization: organization, user: user,
               cost_usd: 9.99, occurred_at: 2.months.ago)

        authenticated_get "/api/v1/organizations/#{organization.id}/stats/overview",
                          user: user,
                          organization: organization,
                          params: { month: 2.months.ago.strftime("%Y-%m") }

        expect_success
        expect(json_response[:total_events]).to eq(1)
        expect(json_response[:total_cost_usd]).to be_within(0.01).of(9.99)
      end

      it 'counts active_users within the given month (not rolling 7 days)' do
        create(:tool_event, organization: organization, user: user,
               occurred_at: 2.months.ago)
        other_user = create(:user)
        create(:organization_membership, user: other_user, organization: organization)

        authenticated_get "/api/v1/organizations/#{organization.id}/stats/overview",
                          user: user,
                          organization: organization,
                          params: { month: 2.months.ago.strftime("%Y-%m") }

        expect_success
        expect(json_response[:active_users]).to eq(1)
      end

      it 'compares selected month trends against the previous month' do
        target_month = 2.months.ago
        previous_month = target_month.prev_month

        create(:tool_event, organization: organization, user: user,
               cost_usd: 5.0, occurred_at: target_month.beginning_of_month + 1.day)
        create(:tool_event, organization: organization, user: user,
               cost_usd: 5.0, occurred_at: target_month.beginning_of_month + 2.days)
        create(:tool_event, organization: organization, user: user,
               cost_usd: 5.0, occurred_at: previous_month.beginning_of_month + 1.day)

        authenticated_get "/api/v1/organizations/#{organization.id}/stats/overview",
                          user: user,
                          organization: organization,
                          params: { month: target_month.strftime("%Y-%m") }

        expect_success
        expect(json_response[:events_change_percent]).to eq(100.0)
        expect(json_response[:cost_change_percent]).to eq(100.0)
      end
    end

    context 'with all_time=true' do
      it 'returns unbounded totals with nil change_percents' do
        create(:tool_event, organization: organization, user: user,
               cost_usd: 2.0, occurred_at: 6.months.ago)

        authenticated_get "/api/v1/organizations/#{organization.id}/stats/overview",
                          user: user,
                          organization: organization,
                          params: { all_time: true }

        expect_success
        expect(json_response[:total_events]).to be_a(Integer)
        expect(json_response[:total_cost_usd]).to be_a(Numeric)
        expect(json_response[:events_change_percent]).to be_nil
        expect(json_response[:cost_change_percent]).to be_nil
      end

      it 'scopes to project_id when combined with all_time=true' do
        project = create(:project, organization: organization)
        create(:tool_event, organization: organization, project: project, user: user,
               cost_usd: 3.0, occurred_at: 1.year.ago)
        other_event_count = organization.tool_events.count

        authenticated_get "/api/v1/organizations/#{organization.id}/stats/overview",
                          user: user,
                          organization: organization,
                          params: { all_time: true, project_id: project.id }

        expect_success
        expect(json_response[:total_events]).to be < other_event_count
      end
    end
  end

  describe 'GET /api/v1/organizations/:organization_id/stats/active_users' do
    it 'returns the active user count for the default 7-day window' do
      authenticated_get "/api/v1/organizations/#{organization.id}/stats/active_users",
                        user: user,
                        organization: organization

      expect_success
      expect(json_response[:active_users]).to eq(1)
      expect(json_response[:timeRange][:start]).to be_present
      expect(json_response[:timeRange][:end]).to be_present
    end

    it 'ignores the month filter and stays on the rolling window (AIX-446)' do
      # An event two months ago must not count toward the 7-day window even
      # though the month param would otherwise select it.
      old_user = create(:user)
      create(:organization_membership, user: old_user, organization: organization)
      create(:tool_event, organization: organization, user: old_user, occurred_at: 2.months.ago)

      authenticated_get "/api/v1/organizations/#{organization.id}/stats/active_users",
                        user: user,
                        organization: organization,
                        params: { month: 2.months.ago.strftime("%Y-%m") }

      expect_success
      # Only the current-week user (from the top-level before block) is counted.
      expect(json_response[:active_users]).to eq(1)
    end

    it 'returns 400 for days=0' do
      authenticated_get "/api/v1/organizations/#{organization.id}/stats/active_users",
                        user: user,
                        organization: organization,
                        params: { days: 0 }

      expect(response).to have_http_status(:bad_request)
    end

    it 'returns 400 for days exceeding the maximum' do
      authenticated_get "/api/v1/organizations/#{organization.id}/stats/active_users",
                        user: user,
                        organization: organization,
                        params: { days: 366 }

      expect(response).to have_http_status(:bad_request)
    end

    it 'honours a custom days window' do
      old_user = create(:user)
      create(:organization_membership, user: old_user, organization: organization)
      create(:tool_event, organization: organization, user: old_user, occurred_at: 20.days.ago)

      authenticated_get "/api/v1/organizations/#{organization.id}/stats/active_users",
                        user: user,
                        organization: organization,
                        params: { days: 30 }

      expect_success
      expect(json_response[:active_users]).to eq(2)
    end

    it 'scopes to project_id when provided' do
      project = create(:project, organization: organization)
      project_user = create(:user)
      create(:organization_membership, user: project_user, organization: organization)
      create(:tool_event, organization: organization, project: project, user: project_user,
             occurred_at: Time.current)

      authenticated_get "/api/v1/organizations/#{organization.id}/stats/active_users",
                        user: user,
                        organization: organization,
                        params: { project_id: project.id }

      expect_success
      expect(json_response[:active_users]).to eq(1)
    end

    it 'returns 404 for project_id belonging to another org' do
      other_org = create(:organization)
      other_project = create(:project, organization: other_org)

      authenticated_get "/api/v1/organizations/#{organization.id}/stats/active_users",
                        user: user,
                        organization: organization,
                        params: { project_id: other_project.id }

      expect(response).to have_http_status(:not_found)
    end

    it 'returns 403 for non-members' do
      non_member = create(:user)

      authenticated_get "/api/v1/organizations/#{organization.id}/stats/active_users",
                        user: non_member,
                        organization: organization

      expect_forbidden
    end
  end

  describe 'timezone-aware date ranges (AIX-447)' do
    let(:org)    { create(:organization) }
    let(:member) { create(:user) }

    before { create(:organization_membership, user: member, organization: org, role: 'member') }

    it 'anchors the rolling window to local midnight for the tz param' do
      travel_to(Time.utc(2026, 7, 2, 8, 24)) do
        # 00:30 on Jun 3 in Brussels (UTC+2) == 22:30 on Jun 2 UTC — inside a
        # 30-day window anchored to Brussels midnight, outside one anchored to UTC.
        create(:tool_event, organization: org, user: member,
               occurred_at: Time.utc(2026, 6, 2, 22, 30))

        authenticated_get "/api/v1/organizations/#{org.id}/stats/active_users",
                          user: member,
                          organization: org,
                          params: { days: 30, tz: "Europe/Brussels" }

        expect_success
        expect(json_response[:active_users]).to eq(1)
        expect(json_response[:timeRange][:start]).to eq("2026-06-03T00:00:00+02:00")
      end
    end

    it 'keeps UTC midnight when tz is absent' do
      travel_to(Time.utc(2026, 7, 2, 8, 24)) do
        create(:tool_event, organization: org, user: member,
               occurred_at: Time.utc(2026, 6, 2, 22, 30))

        authenticated_get "/api/v1/organizations/#{org.id}/stats/active_users",
                          user: member,
                          organization: org,
                          params: { days: 30 }

        expect_success
        expect(json_response[:active_users]).to eq(0)
        expect(json_response[:timeRange][:start]).to eq("2026-06-03T00:00:00Z")
      end
    end

    it 'falls back to UTC for an unknown tz identifier' do
      travel_to(Time.utc(2026, 7, 2, 8, 24)) do
        authenticated_get "/api/v1/organizations/#{org.id}/stats/active_users",
                          user: member,
                          organization: org,
                          params: { days: 30, tz: "Not/AZone" }

        expect_success
        expect(json_response[:timeRange][:start]).to eq("2026-06-03T00:00:00Z")
      end
    end

    it 'buckets daily stats by local calendar day and starts the window at local midnight' do
      travel_to(Time.utc(2026, 7, 2, 8, 24)) do
        create(:tool_event, organization: org, user: member,
               occurred_at: Time.utc(2026, 6, 2, 22, 30), cost_usd: 1.0)

        authenticated_get "/api/v1/organizations/#{org.id}/stats/daily",
                          user: member,
                          organization: org,
                          params: { days: 30, tz: "Europe/Brussels" }

        expect_success
        dates = json_response[:data].map { |d| d[:date] }
        expect(dates.first).to eq("2026-06-03")
        row = json_response[:data].find { |d| d[:date] == "2026-06-03" }
        expect(row[:event_count]).to eq(1)
      end
    end

    it 'scopes the overview month to the client timezone' do
      travel_to(Time.utc(2026, 7, 2, 8, 24)) do
        # 00:30 on Jun 1 in Brussels == 22:30 on May 31 UTC — belongs to June locally.
        create(:tool_event, organization: org, user: member,
               occurred_at: Time.utc(2026, 5, 31, 22, 30))

        authenticated_get "/api/v1/organizations/#{org.id}/stats/overview",
                          user: member,
                          organization: org,
                          params: { month: "2026-06", tz: "Europe/Brussels" }

        expect_success
        expect(json_response[:total_events]).to eq(1)
      end
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

    context 'with month= param' do
      it 'returns daily rows scoped to that calendar month' do
        target_month = 2.months.ago.beginning_of_month
        create(:tool_event, organization: organization, user: user,
               cost_usd: 5.0, occurred_at: target_month + 5.days)
        create(:tool_event, organization: organization, user: user,
               cost_usd: 3.0, occurred_at: 6.months.ago)

        authenticated_get "/api/v1/organizations/#{organization.id}/stats/daily",
                          user: user,
                          organization: organization,
                          params: { month: target_month.strftime("%Y-%m") }

        expect_success
        dates = json_response[:data].map { |r| Date.parse(r[:date]) }
        expect(dates).to all(be >= target_month.to_date)
        expect(dates).to all(be <= target_month.end_of_month.to_date)
        total_cost = json_response[:data].sum { |r| r[:cost_usd] }
        expect(total_cost).to be_within(0.01).of(5.0)
      end

      it 'scopes to project_id when provided' do
        project = create(:project, organization: organization)
        project_event = create(:tool_event, organization: organization, user: user,
                               project: project, cost_usd: 7.0,
                               occurred_at: Date.current.beginning_of_month + 1.day)
        create(:tool_event, organization: organization, user: user,
               cost_usd: 2.0, occurred_at: Date.current.beginning_of_month + 2.days)

        authenticated_get "/api/v1/organizations/#{organization.id}/stats/daily",
                          user: user,
                          organization: organization,
                          params: { month: Date.current.strftime("%Y-%m"), project_id: project.id }

        expect_success
        total_cost = json_response[:data].sum { |r| r[:cost_usd] }
        expect(total_cost).to be_within(0.01).of(project_event.cost_usd)
      end

      it 'filters to unattributed events when project_id=none' do
        project = create(:project, organization: organization)
        create(:tool_event, organization: organization, user: user,
               project: project, cost_usd: 11.0,
               occurred_at: Date.current.beginning_of_month + 1.day)
        create(:tool_event, organization: organization, user: user,
               project: nil, cost_usd: 2.5,
               occurred_at: Date.current.beginning_of_month + 2.days)

        authenticated_get "/api/v1/organizations/#{organization.id}/stats/daily",
                          user: user,
                          organization: organization,
                          params: { month: Date.current.strftime("%Y-%m"), project_id: "none" }

        expect_success
        total_cost = json_response[:data].sum { |r| r[:cost_usd] }
        expect(total_cost).to be_within(0.01).of(2.5)
      end
    end

    context 'with all_time=true and period=month' do
      it 'returns monthly-bucketed rows without zero-fill' do
        create(:tool_event, organization: organization, user: user,
               cost_usd: 1.0, occurred_at: 3.months.ago)

        authenticated_get "/api/v1/organizations/#{organization.id}/stats/daily",
                          user: user,
                          organization: organization,
                          params: { all_time: true, period: "month" }

        expect_success
        expect(json_response[:data]).to be_an(Array)
        expect(json_response[:tool_breakdown]).to be_an(Array)
        # Should have sparse data only (no zero-filled months)
        expect(json_response[:data].length).to be < 13
      end

      it 'scopes to project_id when provided' do
        project = create(:project, organization: organization)
        create(:tool_event, organization: organization, user: user,
               project: project, cost_usd: 9.0, occurred_at: 1.month.ago)
        create(:tool_event, organization: organization, user: user,
               cost_usd: 2.0, occurred_at: 1.month.ago)

        authenticated_get "/api/v1/organizations/#{organization.id}/stats/daily",
                          user: user,
                          organization: organization,
                          params: { all_time: true, period: "month", project_id: project.id }

        expect_success
        total_cost = json_response[:data].sum { |r| r[:cost_usd] }
        expect(total_cost).to be_within(0.01).of(9.0)
      end
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

    it 'accepts period=week and month params' do
      authenticated_get "/api/v1/organizations/#{organization.id}/stats/daily_by_tool",
                        user: user,
                        organization: organization,
                        params: { period: 'week', month: Time.current.strftime('%Y-%m') }

      expect_success
      expect(json_response[:data]).to be_an(Array)
      expect(json_response[:tools]).to be_an(Array)
    end

    it 'accepts period=month and returns monthly buckets' do
      authenticated_get "/api/v1/organizations/#{organization.id}/stats/daily_by_tool",
                        user: user,
                        organization: organization,
                        params: { period: 'month', days: 365 }

      expect_success
      expect(json_response[:data]).to be_an(Array)
      expect(json_response[:tools]).to be_an(Array)
      expect(json_response[:period]).to eq('month')
    end

    it 'zero-fills the full monthly range when period=month' do
      authenticated_get "/api/v1/organizations/#{organization.id}/stats/daily_by_tool",
                        user: user,
                        organization: organization,
                        params: { period: 'month', days: 365 }

      expect_success
      dates = json_response[:data].map { |d| d[:date] }
      # All dates should be the 1st of their respective months
      dates.each do |d|
        expect(Date.parse(d).day).to eq(1)
      end
      # Should span approximately 12 months (±1 for boundaries)
      expect(dates.length).to be_between(12, 14)
    end

    it 'scopes by project_id' do
      project = create(:project, organization: organization)
      create(:tool_event, organization: organization, project: project, user: user,
             tool_name: 'claude_code', occurred_at: Time.current)

      authenticated_get "/api/v1/organizations/#{organization.id}/stats/daily_by_tool",
                        user: user,
                        organization: organization,
                        params: { project_id: project.id }

      expect_success
    end

    it 'filters by project_id=none' do
      project = create(:project, organization: organization)
      create(:tool_event, organization: organization, project: project, user: user,
             tool_name: 'cursor', occurred_at: Time.current)
      create(:tool_event, organization: organization, project: nil, user: user,
             tool_name: 'claude_code', occurred_at: Time.current)

      authenticated_get "/api/v1/organizations/#{organization.id}/stats/daily_by_tool",
                        user: user,
                        organization: organization,
                        params: { project_id: "none" }

      expect_success
      expect(json_response[:tools]).to include("claude_code")
      expect(json_response[:tools]).not_to include("cursor")
    end

    context 'with all_time=true' do
      it 'returns monthly-bucketed aggregated rows without zero-fill' do
        create(:tool_event, organization: organization, user: user,
               tool_name: 'claude_code', occurred_at: 4.months.ago)

        authenticated_get "/api/v1/organizations/#{organization.id}/stats/daily_by_tool",
                          user: user,
                          organization: organization,
                          params: { all_time: true }

        expect_success
        expect(json_response[:data]).to be_an(Array)
        expect(json_response[:tools]).to be_an(Array)
        expect(json_response[:period]).to eq("month")
      end
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

        expect(response).to have_http_status(:unprocessable_content)
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

  describe 'GET /api/v1/organizations/:organization_id/stats/tools/:tool_name/daily' do
    let(:frozen_time) { Time.zone.parse("2026-04-15 12:00:00") }
    let(:path) { "/api/v1/organizations/#{organization.id}/stats/tools/claude_code/daily" }

    before do
      travel_to(frozen_time) do
        # Two events on Apr 10
        create(:tool_event, organization: organization, user: user,
               tool_name: "claude_code", tokens_in: 100, tokens_out: 200,
               cost_usd: 0.05, occurred_at: Time.zone.parse("2026-04-10 10:00:00"))
        create(:tool_event, organization: organization, user: user,
               tool_name: "claude_code", tokens_in: 50, tokens_out: 100,
               cost_usd: 0.02, occurred_at: Time.zone.parse("2026-04-10 14:00:00"))

        # One event on Apr 13
        create(:tool_event, organization: organization, user: user,
               tool_name: "claude_code", tokens_in: 200, tokens_out: 400,
               cost_usd: 0.10, occurred_at: Time.zone.parse("2026-04-13 09:00:00"))

        # Event from a different tool (should not appear)
        create(:tool_event, organization: organization, user: user,
               tool_name: "cursor", tokens_in: 999, tokens_out: 999,
               cost_usd: 9.99, occurred_at: Time.zone.parse("2026-04-10 10:00:00"))
      end
    end

    it "returns tool, timeRange, and daily keys" do
      travel_to(frozen_time) do
        authenticated_get path, user: user, organization: organization
      end

      expect_success
      expect(json_response).to have_key(:tool)
      expect(json_response).to have_key(:timeRange)
      expect(json_response).to have_key(:daily)
    end

    it "returns the tool name" do
      travel_to(frozen_time) do
        authenticated_get path, user: user, organization: organization
      end

      expect_success
      expect(json_response[:tool]).to eq("claude_code")
    end

    it "returns 30 entries for the default 30-day range" do
      travel_to(frozen_time) do
        authenticated_get path, user: user, organization: organization
      end

      expect_success
      # (30-1).days.ago.beginning_of_day (Mar 17) to Time.current (Apr 15) inclusive = 30 days
      expect(json_response[:daily].length).to eq(30)
    end

    it "supports ?start_date= / ?end_date= params" do
      travel_to(frozen_time) do
        authenticated_get path,
                          user: user,
                          organization: organization,
                          params: { start_date: "2026-04-08", end_date: "2026-04-13" }
      end

      expect_success
      # Apr 8 to Apr 13 inclusive = 6 entries, bounded by end_date not today
      expect(json_response[:daily].length).to eq(6)
      expect(json_response[:daily].first[:date]).to eq("2026-04-08")
      expect(json_response[:daily].last[:date]).to eq("2026-04-13")
    end

    it "zero-fills days with no events" do
      travel_to(frozen_time) do
        authenticated_get path, user: user, organization: organization
      end

      expect_success
      zero_day = json_response[:daily].find { |d| d[:date] == "2026-04-11" }
      expect(zero_day[:eventCount]).to eq(0)
      expect(zero_day[:tokensIn]).to eq(0)
      expect(zero_day[:tokensOut]).to eq(0)
      expect(zero_day[:costUsd]).to eq(0.0)
    end

    it "aggregates events correctly for days with data" do
      travel_to(frozen_time) do
        authenticated_get path, user: user, organization: organization
      end

      expect_success
      apr10 = json_response[:daily].find { |d| d[:date] == "2026-04-10" }
      expect(apr10[:eventCount]).to eq(2)
      expect(apr10[:tokensIn]).to eq(150)
      expect(apr10[:tokensOut]).to eq(300)
      expect(apr10[:costUsd].to_f).to be_within(0.001).of(0.07)
    end

    it "excludes events from other tools" do
      travel_to(frozen_time) do
        authenticated_get path, user: user, organization: organization
      end

      expect_success
      total_events = json_response[:daily].sum { |d| d[:eventCount] }
      # Only 3 claude_code events, not the cursor one
      expect(total_events).to eq(3)
    end

    it "respects the ?days=7 param" do
      travel_to(frozen_time) do
        authenticated_get path, user: user, organization: organization, params: { days: 7 }
      end

      expect_success
      # (7-1) days back from Apr 9 to Apr 15 inclusive = 7 entries
      expect(json_response[:daily].length).to eq(7)
    end

    it "returns 403 for non-members" do
      non_member = create(:user)

      travel_to(frozen_time) do
        authenticated_get path, user: non_member, organization: organization
      end

      expect_forbidden
    end
  end

  describe 'GET /api/v1/organizations/:organization_id/stats/tools/:tool_name/event_types' do
    let(:frozen_time) { Time.zone.parse("2026-04-15 12:00:00") }
    let(:path) { "/api/v1/organizations/#{organization.id}/stats/tools/cursor/event_types" }

    before do
      travel_to(frozen_time) do
        # Two chat events
        create(:tool_event, organization: organization, user: user,
               tool_name: "cursor", event_type: "chat",
               tokens_in: 100, tokens_out: 200, cost_usd: 1.0,
               occurred_at: Time.current)
        create(:tool_event, organization: organization, user: user,
               tool_name: "cursor", event_type: "chat",
               tokens_in: 50, tokens_out: 100, cost_usd: 0.5,
               occurred_at: 1.day.ago)

        # One completion event (fewer events — should sort second)
        create(:tool_event, organization: organization, user: user,
               tool_name: "cursor", event_type: "completion",
               tokens_in: 300, tokens_out: 600, cost_usd: 2.0,
               occurred_at: Time.current)

        # Different tool — must not appear
        create(:tool_event, organization: organization, user: user,
               tool_name: "claude_code", event_type: "chat",
               tokens_in: 999, tokens_out: 999, cost_usd: 99.0,
               occurred_at: Time.current)
      end
    end

    it "returns correct top-level shape" do
      travel_to(frozen_time) { authenticated_get path, user: user, organization: organization }

      expect_success
      expect(json_response[:tool]).to eq("cursor")
      expect(json_response[:timeRange]).to have_key(:start)
      expect(json_response[:timeRange]).to have_key(:end)
      expect(json_response[:eventTypes]).to be_an(Array)
    end

    it "returns event type entries sorted by eventCount descending" do
      travel_to(frozen_time) { authenticated_get path, user: user, organization: organization }

      expect_success
      counts = json_response[:eventTypes].map { |e| e[:eventCount] }
      expect(counts).to eq(counts.sort.reverse)
      expect(json_response[:eventTypes].first[:name]).to eq("chat")
    end

    it "returns aggregated token and cost fields per event type" do
      travel_to(frozen_time) { authenticated_get path, user: user, organization: organization }

      expect_success
      chat = json_response[:eventTypes].find { |e| e[:name] == "chat" }
      expect(chat[:eventCount]).to eq(2)
      expect(chat[:tokensIn]).to eq(150)
      expect(chat[:tokensOut]).to eq(300)
      expect(chat[:costUsd].to_f).to be_within(0.001).of(1.5)
    end

    it "scopes results to the requested tool only" do
      travel_to(frozen_time) { authenticated_get path, user: user, organization: organization }

      expect_success
      chat = json_response[:eventTypes].find { |e| e[:name] == "chat" }
      # cursor chat only: 2 events, not inflated by claude_code
      expect(chat[:eventCount]).to eq(2)
    end

    it "returns all defined event types including those with zero events" do
      travel_to(frozen_time) { authenticated_get path, user: user, organization: organization }

      expect_success
      names = json_response[:eventTypes].map { |e| e[:name] }
      expect(names).to match_array(ToolEvent::EVENT_TYPES)

      zero_type = json_response[:eventTypes].find { |e| e[:name] == "debug" }
      expect(zero_type[:eventCount]).to eq(0)
      expect(zero_type[:tokensIn]).to eq(0)
      expect(zero_type[:tokensOut]).to eq(0)
      expect(zero_type[:costUsd]).to eq(0.0)
    end

    it "supports ?days= param" do
      travel_to(frozen_time) do
        authenticated_get path, user: user, organization: organization, params: { days: 7 }
      end

      expect_success
      expect(json_response[:eventTypes]).to be_an(Array)
    end

    it "supports ?start_date= / ?end_date= params" do
      travel_to(frozen_time) do
        authenticated_get path, user: user, organization: organization,
                          params: { start_date: 7.days.ago.iso8601, end_date: Time.current.iso8601 }
      end

      expect_success
      expect(json_response[:eventTypes]).to be_an(Array)
    end

    it "returns 403 for non-members" do
      non_member = create(:user)

      travel_to(frozen_time) do
        authenticated_get path, user: non_member, organization: organization
      end

      expect_forbidden
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

  describe 'GET /api/v1/organizations/:organization_id/stats/risk_alerts' do
    let(:path) { "/api/v1/organizations/#{organization.id}/stats/risk_alerts" }
    let!(:risky_event) do
      create(:tool_event, organization: organization, user: user,
             tool_name: 'claude_code', tokens_in: 1000, tokens_out: 500,
             cost_usd: 2.0, occurred_at: Time.current)
    end

    before do
      create(:audit_log, organization: organization, tool_event: risky_event, risk_level: 'high')
    end

    it 'returns tool-grouped risk alert rows' do
      authenticated_get path, user: user, organization: organization

      expect_success
      expect(json_response).to be_an(Array)
      row = json_response.find { |r| r[:toolName] == 'claude_code' }
      expect(row).to be_present
      expect(row[:eventCount]).to be_a(Integer)
      expect(row[:tokensIn]).to be_a(Integer)
      expect(row[:tokensOut]).to be_a(Integer)
      expect(row[:costUsd]).to be_a(Numeric)
    end

    it 'does not inflate counts when a tool_event has multiple audit_logs' do
      create(:audit_log, organization: organization, tool_event: risky_event, risk_level: 'medium')

      authenticated_get path, user: user, organization: organization

      expect_success
      row = json_response.find { |r| r[:toolName] == 'claude_code' }
      expect(row[:eventCount]).to eq(1)
      expect(row[:tokensIn]).to eq(1000)
    end

    it 'excludes events with only none-level audit logs' do
      safe_event = create(:tool_event, organization: organization, user: user,
                          tool_name: 'cursor', cost_usd: 0.0, occurred_at: Time.current)
      create(:audit_log, organization: organization, tool_event: safe_event, risk_level: 'none')

      authenticated_get path, user: user, organization: organization

      expect_success
      tool_names = json_response.map { |r| r[:toolName] }
      expect(tool_names).not_to include('cursor')
    end

    it 'scopes by project_id' do
      project = create(:project, organization: organization)
      proj_event = create(:tool_event, organization: organization, project: project,
                          user: user, tool_name: 'cursor', cost_usd: 1.0, occurred_at: Time.current)
      create(:audit_log, organization: organization, tool_event: proj_event, risk_level: 'high')

      authenticated_get path, user: user, organization: organization,
                        params: { project_id: project.id }

      expect_success
      tool_names = json_response.map { |r| r[:toolName] }
      expect(tool_names).to include('cursor')
      expect(tool_names).not_to include('claude_code')
    end

    it 'filters by project_id=none' do
      project = create(:project, organization: organization)
      project_event = create(:tool_event, organization: organization, project: project,
                             user: user, tool_name: 'cursor', cost_usd: 1.0, occurred_at: Time.current)
      create(:audit_log, organization: organization, tool_event: project_event, risk_level: 'high')

      nil_project_event = create(:tool_event, organization: organization, project: nil,
                                 user: user, tool_name: 'aider', cost_usd: 0.5, occurred_at: Time.current)
      create(:audit_log, organization: organization, tool_event: nil_project_event, risk_level: 'high')

      authenticated_get path, user: user, organization: organization,
                        params: { project_id: "none" }

      expect_success
      tool_names = json_response.map { |r| r[:toolName] }
      expect(tool_names).to include('aider')
      expect(tool_names).not_to include('cursor')
    end

    it 'returns 404 for cross-org project_id' do
      other_project = create(:project, organization: create(:organization))

      authenticated_get path, user: user, organization: organization,
                        params: { project_id: other_project.id }

      expect(response).to have_http_status(:not_found)
    end

    it 'returns 403 for non-members' do
      authenticated_get path, user: create(:user), organization: organization

      expect_forbidden
    end

    context 'metadata fallback (no audit_log)' do
      it 'includes events with risk_level in metadata when no audit_log exists' do
        meta_event = create(:tool_event, organization: organization, user: user,
                            tool_name: 'windsurf', tokens_in: 200, tokens_out: 100,
                            cost_usd: 0.5, occurred_at: Time.current,
                            metadata: { "risk_level" => "high" })

        authenticated_get path, user: user, organization: organization

        expect_success
        row = json_response.find { |r| r[:toolName] == 'windsurf' }
        expect(row).to be_present
        expect(row[:eventCount]).to eq(1)
      end

      it 'excludes events with metadata risk_level "none"' do
        create(:tool_event, organization: organization, user: user,
               tool_name: 'aider', occurred_at: Time.current,
               metadata: { "risk_level" => "none" })

        authenticated_get path, user: user, organization: organization

        expect_success
        tool_names = json_response.map { |r| r[:toolName] }
        expect(tool_names).not_to include('aider')
      end

      it 'prefers audit_log over metadata when both exist' do
        event = create(:tool_event, organization: organization, user: user,
                       tool_name: 'cody', tokens_in: 300, tokens_out: 150,
                       cost_usd: 1.0, occurred_at: Time.current,
                       metadata: { "risk_level" => "medium" })
        create(:audit_log, organization: organization, tool_event: event, risk_level: 'none')

        authenticated_get path, user: user, organization: organization

        expect_success
        tool_names = json_response.map { |r| r[:toolName] }
        expect(tool_names).not_to include('cody')
      end

      it 'counts metadata-only events in overview risk_alerts' do
        create(:tool_event, organization: organization, user: user,
               tool_name: 'cursor', occurred_at: Time.current,
               metadata: { "risk_level" => "critical" })

        authenticated_get "/api/v1/organizations/#{organization.id}/stats/overview",
                          user: user, organization: organization

        expect_success
        expect(json_response[:risk_alerts]).to be >= 1
      end
    end

    context 'with all_time=true' do
      it 'returns risk alerts across all available history' do
        old_event = create(:tool_event, organization: organization, user: user,
                           tool_name: 'claude_code', cost_usd: 1.0, occurred_at: 8.months.ago)
        create(:audit_log, organization: organization, tool_event: old_event, risk_level: 'high')

        authenticated_get path, user: user, organization: organization,
                          params: { all_time: true }

        expect_success
        tool_names = json_response.map { |r| r[:toolName] }
        expect(tool_names).to include('claude_code')
      end
    end
  end

  describe 'GET /api/v1/organizations/:organization_id/stats/daily_by_model' do
    let(:path) { "/api/v1/organizations/#{organization.id}/stats/daily_by_model" }

    before do
      create(:tool_event, organization: organization, user: user,
             model: 'claude-3-5-sonnet', occurred_at: Time.current)
      create(:tool_event, organization: organization, user: user,
             model: 'gpt-4o', occurred_at: Time.current)
      create(:tool_event, organization: organization, user: user,
             model: 'claude-3-5-sonnet', occurred_at: 1.day.ago)
    end

    it 'returns model-grouped daily data' do
      authenticated_get path, user: user, organization: organization

      expect_success
      expect(json_response[:data]).to be_an(Array)
      expect(json_response[:models]).to be_an(Array)
    end

    it 'accepts period=week and month params' do
      authenticated_get path, user: user, organization: organization,
                        params: { period: 'week', month: Time.current.strftime('%Y-%m') }

      expect_success
      expect(json_response[:data]).to be_an(Array)
      expect(json_response[:models]).to be_an(Array)
    end

    it 'filters by project_id=none' do
      project = create(:project, organization: organization)
      create(:tool_event, organization: organization, project: project, user: user,
             model: 'project-model', occurred_at: Time.current)
      create(:tool_event, organization: organization, project: nil, user: user,
             model: 'nil-model', occurred_at: Time.current)

      authenticated_get path, user: user, organization: organization,
                        params: { project_id: "none" }

      expect_success
      expect(json_response[:models]).to include('nil-model')
      expect(json_response[:models]).not_to include('project-model')
    end

    it 'returns 403 for non-members' do
      authenticated_get path, user: create(:user), organization: organization

      expect_forbidden
    end
  end

  describe 'not_none risk_level filter on events' do
    it 'filters tool_events by classification risk_level' do
      # Use a fresh org to avoid interference from the global before block
      fresh_org  = create(:organization)
      fresh_user = create(:user)
      create(:organization_membership, user: fresh_user, organization: fresh_org, role: 'member')

      create(:tool_event, organization: fresh_org, user: fresh_user,
             tool_name: 'claude_code', metadata: { "risk_level" => "low" }, occurred_at: Time.current)
      create(:tool_event, organization: fresh_org, user: fresh_user,
             tool_name: 'cursor', metadata: { "risk_level" => "none" }, occurred_at: Time.current)

      authenticated_get "/api/v1/organizations/#{fresh_org.id}/events",
                        user: fresh_user,
                        organization: fresh_org,
                        params: { risk_level: 'not_none' }

      expect_success
      tool_names = json_response[:data].map { |e| e[:toolName] }
      expect(tool_names).to include('claude_code')
      expect(tool_names).not_to include('cursor')
    end
  end

  describe 'timezone-aware bucketing' do
    let(:fresh_org)  { create(:organization) }
    let(:fresh_user) { create(:user) }
    let!(:fresh_membership) { create(:organization_membership, user: fresh_user, organization: fresh_org, role: 'member') }

    it 'buckets daily data using the provided tz param' do
      # Event at 2026-06-15 23:30 UTC = 2026-06-15 in UTC but 2026-06-15 in America/New_York (19:30 EDT)
      # Event at 2026-06-16 03:30 UTC = 2026-06-16 in UTC but 2026-06-15 in America/New_York (23:30 EDT)
      create(:tool_event, organization: fresh_org, user: fresh_user,
             tool_name: 'claude_code', cost_usd: 0.01,
             occurred_at: Time.utc(2026, 6, 16, 3, 30))

      authenticated_get "/api/v1/organizations/#{fresh_org.id}/stats/daily",
                        user: fresh_user,
                        organization: fresh_org,
                        params: { start_date: '2026-06-15', end_date: '2026-06-16', tz: 'America/New_York' }

      expect_success
      dates_with_events = json_response[:data].select { |d| d[:event_count] > 0 }.map { |d| d[:date] }
      expect(dates_with_events).to include('2026-06-15')
      expect(dates_with_events).not_to include('2026-06-16')
    end

    it 'defaults to UTC when tz param is absent' do
      create(:tool_event, organization: fresh_org, user: fresh_user,
             tool_name: 'claude_code', cost_usd: 0.01,
             occurred_at: Time.utc(2026, 6, 16, 3, 30))

      authenticated_get "/api/v1/organizations/#{fresh_org.id}/stats/daily",
                        user: fresh_user,
                        organization: fresh_org,
                        params: { start_date: '2026-06-15', end_date: '2026-06-16' }

      expect_success
      dates_with_events = json_response[:data].select { |d| d[:event_count] > 0 }.map { |d| d[:date] }
      expect(dates_with_events).to include('2026-06-16')
    end

    it 'falls back to UTC for invalid tz param' do
      create(:tool_event, organization: fresh_org, user: fresh_user,
             tool_name: 'claude_code', cost_usd: 0.01,
             occurred_at: Time.utc(2026, 6, 16, 3, 30))

      authenticated_get "/api/v1/organizations/#{fresh_org.id}/stats/daily",
                        user: fresh_user,
                        organization: fresh_org,
                        params: { start_date: '2026-06-15', end_date: '2026-06-16', tz: 'Invalid/Zone' }

      expect_success
      dates_with_events = json_response[:data].select { |d| d[:event_count] > 0 }.map { |d| d[:date] }
      expect(dates_with_events).to include('2026-06-16')
    end

    it 'applies tz to heatmap endpoint' do
      create(:tool_event, organization: fresh_org, user: fresh_user,
             tool_name: 'claude_code', cost_usd: 0.01,
             occurred_at: Time.utc(2026, 6, 16, 3, 30))

      authenticated_get "/api/v1/organizations/#{fresh_org.id}/stats/heatmap",
                        user: fresh_user,
                        organization: fresh_org,
                        params: { tz: 'America/New_York' }

      expect_success
      dates = json_response.map { |d| d[:date] }
      expect(dates).to include('2026-06-15')
    end
  end

  describe 'month_or_days_time_range validation' do
    it 'returns 400 for malformed month param' do
      authenticated_get "/api/v1/organizations/#{organization.id}/stats/daily_by_tool",
                        user: user,
                        organization: organization,
                        params: { month: 'garbage' }

      expect(response).to have_http_status(:bad_request)
      expect(json_response[:message]).to include('Invalid month format')
    end

    it 'returns 400 for partially malformed month param' do
      authenticated_get "/api/v1/organizations/#{organization.id}/stats/daily_by_model",
                        user: user,
                        organization: organization,
                        params: { month: '2026-13' }

      expect(response).to have_http_status(:bad_request)
    end

    it 'accepts valid month param' do
      authenticated_get "/api/v1/organizations/#{organization.id}/stats/daily_by_tool",
                        user: user,
                        organization: organization,
                        params: { month: '2026-06' }

      expect_success
    end
  end
end

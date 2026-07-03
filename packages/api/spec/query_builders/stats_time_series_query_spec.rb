# frozen_string_literal: true

require "rails_helper"

RSpec.describe StatsTimeSeriesQuery do
  self.use_transactional_tests = false

  let(:organization) { create(:organization) }
  let(:user_a) { create(:user) }
  let(:user_b) { create(:user) }
  let(:frozen_time) { Time.zone.parse("2026-04-15 14:30:00") }

  def raw_totals(start, finish, tool_name: nil)
    scope = organization.tool_events.where(occurred_at: start..finish)
    scope = scope.where(tool_name: tool_name) if tool_name
    { event_count: scope.count, cost_usd: scope.sum(:cost_usd).to_f }
  end

  around do |example|
    travel_to(frozen_time) { example.run }
  end

  after do
    ToolEvent.delete_all
  end

  describe "#totals" do
    before do
      create(:tool_event, organization: organization, user: user_a,
             cost_usd: 1.0, occurred_at: 10.days.ago)
      create(:tool_event, organization: organization, user: user_b,
             cost_usd: 2.0, occurred_at: 5.days.ago)
      create(:tool_event, organization: organization, user: user_a,
             cost_usd: 0.5, occurred_at: 30.minutes.ago)
      refresh_all_token_usage_aggregates!
    end

    it "matches raw totals for a range spanning historical + live window" do
      start = 30.days.ago.beginning_of_day
      finish = Time.current
      query = described_class.new(organization: organization)

      expect(query.totals(start: start, finish: finish)).to eq(raw_totals(start, finish))
    end
  end

  describe "#hourly_buckets" do
    before do
      create(:tool_event, organization: organization, user: user_a,
             tokens_in: 10, tokens_out: 20, cost_usd: 0.1,
             occurred_at: frozen_time - 3.hours)
      create(:tool_event, organization: organization, user: user_b,
             tokens_in: 5, tokens_out: 5, cost_usd: 0.05,
             occurred_at: frozen_time - 3.hours)
      create(:tool_event, organization: organization, user: user_a,
             tokens_in: 1, tokens_out: 1, cost_usd: 0.01,
             occurred_at: frozen_time - 20.minutes)
      refresh_hourly_token_usage!
    end

    it "matches raw hourly aggregation" do
      start = 24.hours.ago
      finish = Time.current
      query = described_class.new(organization: organization)
      result = query.hourly_buckets(start: start, finish: finish)

      raw = organization.tool_events
        .where(occurred_at: start..finish)
        .group("DATE_TRUNC('hour', occurred_at)")
        .select(
          "DATE_TRUNC('hour', occurred_at) as hour",
          "COUNT(*) as event_count",
          "SUM(tokens_in) as tokens_in",
          "SUM(tokens_out) as tokens_out",
          "SUM(cost_usd) as cost_usd",
          "COUNT(DISTINCT user_id) as unique_users"
        )

      expect(result.length).to eq(raw.length)
      result.each do |row|
        raw_row = raw.find { |r| r.hour == row[:hour] }
        expect(raw_row.event_count).to eq(row[:event_count])
        expect(raw_row.cost_usd.to_f).to be_within(0.0001).of(row[:cost_usd])
        expect(raw_row.unique_users).to eq(row[:unique_users])
      end
    end
  end

  describe "#period_buckets with timezone UTC" do
    before do
      create(:tool_event, organization: organization, user: user_a,
             cost_usd: 3.0, occurred_at: Time.utc(2026, 4, 10, 12))
      refresh_daily_token_usage!
    end

    it "matches raw daily buckets when timezone is UTC" do
      start = Time.utc(2026, 4, 1)
      finish = Time.utc(2026, 4, 14, 23, 59, 59)
      query = described_class.new(organization: organization)
      result = query.period_buckets(start: start, finish: finish, granularity: "day", timezone: "UTC")

      raw_scope = organization.tool_events.where(occurred_at: start..finish)
      raw_map = raw_scope
        .group(Arel.sql("DATE_TRUNC('day', occurred_at)"))
        .sum(:cost_usd)

      result.each do |(_key, bucket)|
        next if bucket[:event_count].zero?

        day = Date.parse(bucket[:date])
        expect(bucket[:cost_usd]).to be_within(0.01).of(raw_map[day.beginning_of_day] || 0)
      end
    end
  end

  describe "#period_buckets with non-UTC timezone" do
    it "delegates entirely to raw hypertable (no CAGG)" do
      create(:tool_event, organization: organization, user: user_a,
             cost_usd: 0.01, occurred_at: Time.utc(2026, 6, 16, 3, 30))
      refresh_daily_token_usage!

      start = Time.utc(2026, 6, 15)
      finish = Time.utc(2026, 6, 16, 23, 59, 59)
      query = described_class.new(organization: organization)

      expect(HourlyTokenUsage).not_to receive(:for_organization)
      expect(DailyTokenUsage).not_to receive(:for_organization)

      query.period_buckets(
        start: start, finish: finish, granularity: "day", timezone: "America/New_York"
      )
    end
  end
end

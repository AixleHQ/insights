# frozen_string_literal: true

# Hybrid reader: TimescaleDB continuous aggregates for historical ranges,
# raw tool_events for the live window (end_offset lag) and for dimensions
# CAGGs cannot represent (risk flags, non-UTC day boundaries).
#
# Split rule (avoids double-counting partial buckets at the CAGG/raw boundary):
#   CAGG  — bucket < live_cutoff.beginning_of_(day|hour)
#   Raw   — occurred_at >= that same boundary through finish
class StatsTimeSeriesQuery
  HOURLY_LIVE_WINDOW = 1.hour
  DAILY_LIVE_WINDOW  = 1.day

  class << self
    def enable_cagg_reads!
      Thread.current[:stats_time_series_cagg_reads] = true
    end

    def disable_cagg_reads!
      Thread.current[:stats_time_series_cagg_reads] = false
    end

    def cagg_reads_enabled?
      return true unless Rails.env.test?

      Thread.current[:stats_time_series_cagg_reads] == true
    end
  end

  def initialize(organization:, project_id: nil, unassigned_project_only: false, tool_name: nil)
    @organization = organization
    @project_id   = project_id
    @unassigned_project_only = unassigned_project_only
    @tool_name    = tool_name
  end

  def totals(start:, finish:, timezone: "UTC")
    return raw_totals(start, finish) unless cagg_eligible?(timezone)

    cutoff = daily_cagg_exclusive_end
    merge_totals(
      daily_aggregate_totals(start, cagg_finish(start, finish, cutoff)),
      raw_totals(raw_start(start, cutoff), finish)
    )
  end

  def distinct_user_count(start:, finish:, timezone: "UTC")
    return raw_distinct_user_count(start, finish) unless cagg_eligible?(timezone)

    user_ids = Set.new
    cagg_end = cagg_finish(start, finish, daily_cagg_exclusive_end)

    if start < cagg_end
      user_ids.merge(
        scoped_daily
          .where(bucket: start...cagg_end)
          .where.not(user_id: nil)
          .distinct
          .pluck(:user_id)
      )
    end

    raw_from = raw_start(start, daily_cagg_exclusive_end)
    if finish >= raw_from
      user_ids.merge(
        scoped_raw
          .where(occurred_at: raw_from..finish)
          .where.not(user_id: nil)
          .distinct
          .pluck(:user_id)
      )
    end

    user_ids.size
  end

  def hourly_buckets(start:, finish:)
    return raw_hourly_buckets(start, finish) unless self.class.cagg_reads_enabled?
    cutoff   = hourly_cagg_exclusive_end
    cagg_end = cagg_finish(start, finish, cutoff)
    buckets  = {}

    if start < cagg_end
      scoped_hourly
        .where(bucket: start...cagg_end)
        .group(:bucket)
        .select(
          "bucket as hour",
          "SUM(event_count) as event_count",
          "SUM(total_tokens_in) as tokens_in",
          "SUM(total_tokens_out) as tokens_out",
          "SUM(total_cost) as cost_usd",
          "COUNT(DISTINCT user_id) as unique_users"
        )
        .each { |row| buckets[row.hour] = row_to_hourly(row) }
    end

    raw_from = raw_start(start, cutoff)
    if finish >= raw_from
      scoped_raw
        .where(occurred_at: raw_from..finish)
        .group("DATE_TRUNC('hour', occurred_at)")
        .select(
          "DATE_TRUNC('hour', occurred_at) as hour",
          "COUNT(*) as event_count",
          "SUM(tokens_in) as tokens_in",
          "SUM(tokens_out) as tokens_out",
          "SUM(cost_usd) as cost_usd",
          "COUNT(DISTINCT user_id) as unique_users"
        )
        .each { |row| merge_hourly!(buckets, row.hour, row) }
    end

    buckets.sort_by { |hour, _| hour }.map { |_, v| v }
  end

  def period_buckets(start:, finish:, granularity: "day", timezone: "UTC")
    return raw_period_buckets(start, finish, granularity, timezone) unless cagg_eligible?(timezone)

    cagg_end = cagg_finish(start, finish, daily_cagg_exclusive_end)
    bucket_expr = DailyTokenUsage.bucket_expr(granularity)
    buckets = {}

    if start < cagg_end
      scoped_daily
        .where(bucket: start...cagg_end)
        .group(bucket_expr)
        .select(
          "#{bucket_expr} as day",
          "SUM(event_count) as event_count",
          "SUM(total_cost) as cost_usd"
        )
        .each { |row| merge_period!(buckets, row.day, row.event_count, row.cost_usd) }
    end

    raw_from = raw_start(start, daily_cagg_exclusive_end)
    if finish >= raw_from
      raw_period_rows(raw_from, finish, granularity, timezone).each do |row|
        merge_period!(buckets, row.day, row.event_count, row.cost_usd)
      end
    end

    buckets.transform_values do |v|
      { date: v[:date], event_count: v[:event_count], cost_usd: v[:cost_usd].to_f }
    end
  end

  def tool_period_buckets(start:, finish:, granularity: "day", timezone: "UTC")
    return raw_tool_period_buckets(start, finish, granularity, timezone) unless cagg_eligible?(timezone)

    cagg_end = cagg_finish(start, finish, daily_cagg_exclusive_end)
    bucket_expr = DailyTokenUsage.bucket_expr(granularity)
    buckets = {}

    if start < cagg_end
      scoped_daily
        .where(bucket: start...cagg_end)
        .group(bucket_expr)
        .select(
          "#{bucket_expr} as day",
          "SUM(event_count) as event_count",
          "SUM(total_tokens_in) as tokens_in",
          "SUM(total_tokens_out) as tokens_out",
          "SUM(total_cost) as cost_usd"
        )
        .each do |row|
          merge_tool_period!(buckets, row.day, row.event_count, row.tokens_in, row.tokens_out, row.cost_usd)
        end
    end

    raw_from = raw_start(start, daily_cagg_exclusive_end)
    if finish >= raw_from
      raw_tool_period_rows(raw_from, finish, granularity, timezone).each do |row|
        merge_tool_period!(buckets, row.day, row.event_count, row.tokens_in, row.tokens_out, row.cost_usd)
      end
    end

    buckets.transform_values do |v|
      {
        date: v[:date],
        event_count: v[:event_count],
        tokens_in: v[:tokens_in],
        tokens_out: v[:tokens_out],
        cost_usd: v[:cost_usd].to_f
      }
    end
  end

  def heatmap_counts(start:, finish:, timezone: "UTC")
    return raw_heatmap_counts(start, finish, timezone) unless cagg_eligible?(timezone)

    period_buckets(start: start, finish: finish, granularity: "day", timezone: timezone)
      .transform_values { |v| v[:event_count] }
  end

  def tool_breakdown(start:, finish:, timezone: "UTC")
    return raw_tool_breakdown(start, finish, timezone) unless cagg_eligible?(timezone)

    cutoff   = daily_cagg_exclusive_end
    cagg_end = cagg_finish(start, finish, cutoff)
    totals_by_tool = Hash.new { |h, k| h[k] = { event_count: 0, cost_usd: 0.0 } }

    if start < cagg_end
      scoped_daily
        .where(bucket: start...cagg_end)
        .group(:tool_name)
        .select("tool_name, SUM(event_count) as event_count, SUM(total_cost) as cost_usd")
        .each do |row|
          totals_by_tool[row.tool_name][:event_count] += row.event_count
          totals_by_tool[row.tool_name][:cost_usd]   += row.cost_usd.to_f
        end
    end

    raw_from = raw_start(start, cutoff)
    if finish >= raw_from
      scoped_raw
        .where(occurred_at: raw_from..finish)
        .group(:tool_name)
        .select("tool_name, COUNT(*) as event_count, SUM(cost_usd) as cost_usd")
        .each do |row|
          totals_by_tool[row.tool_name][:event_count] += row.event_count
          totals_by_tool[row.tool_name][:cost_usd]   += row.cost_usd.to_f
        end
    end

    totals_by_tool.map do |tool_name, stats|
      { tool_name: tool_name, event_count: stats[:event_count], cost_usd: stats[:cost_usd] }
    end.sort_by { |r| -r[:event_count] }
  end

  private

  attr_reader :organization, :project_id, :unassigned_project_only, :tool_name

  def cagg_eligible?(timezone)
    timezone == "UTC" && self.class.cagg_reads_enabled?
  end

  def hourly_live_cutoff = Time.current - HOURLY_LIVE_WINDOW
  def daily_live_cutoff  = Time.current - DAILY_LIVE_WINDOW
  def hourly_cagg_exclusive_end = hourly_live_cutoff.beginning_of_hour
  def daily_cagg_exclusive_end  = daily_live_cutoff.beginning_of_day

  def cagg_finish(start, finish, exclusive_end)
    [ finish, exclusive_end ].min
  end

  def raw_start(request_start, exclusive_end)
    [ request_start, exclusive_end ].max
  end

  def scoped_hourly
    scope = HourlyTokenUsage.for_organization(organization)
    scope = apply_project_scope(scope)
    scope = scope.for_tool(tool_name) if tool_name.present?
    scope
  end

  def scoped_daily
    scope = DailyTokenUsage.for_organization(organization)
    scope = apply_project_scope(scope)
    scope = scope.for_tool(tool_name) if tool_name.present?
    scope
  end

  def scoped_raw
    scope = organization.tool_events
    scope = apply_project_scope(scope)
    scope = scope.where(tool_name: tool_name) if tool_name.present?
    scope
  end

  def apply_project_scope(scope)
    if unassigned_project_only
      scope.where(project_id: nil)
    elsif project_id.present?
      scope.where(project_id: project_id)
    else
      scope
    end
  end

  def daily_aggregate_totals(start, cagg_end)
    agg = { event_count: 0, cost_usd: 0.0 }
    return agg unless start < cagg_end

    row = scoped_daily
      .where(bucket: start...cagg_end)
      .pick(Arel.sql("COALESCE(SUM(event_count), 0)"), Arel.sql("COALESCE(SUM(total_cost), 0)"))
    agg[:event_count] += row[0].to_i
    agg[:cost_usd]    += row[1].to_f
    agg
  end

  def raw_hourly_buckets(start, finish)
    scoped_raw
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
      .order("hour")
      .map { |row| row_to_hourly(row) }
  end

  def raw_totals(start, finish)
    return { event_count: 0, cost_usd: 0.0 } if finish < start

    scope = scoped_raw.where(occurred_at: start..finish)
    { event_count: scope.count, cost_usd: scope.sum(:cost_usd).to_f }
  end

  def raw_distinct_user_count(start, finish)
    scoped_raw
      .where(occurred_at: start..finish)
      .where.not(user_id: nil)
      .distinct
      .count(:user_id)
  end

  def merge_totals(agg, raw)
    {
      event_count: agg[:event_count] + raw[:event_count],
      cost_usd:    agg[:cost_usd] + raw[:cost_usd]
    }
  end

  def row_to_hourly(row)
    {
      hour: row.hour,
      event_count: row.event_count.to_i,
      tokens_in: row.tokens_in.to_i,
      tokens_out: row.tokens_out.to_i,
      cost_usd: row.cost_usd.to_f,
      unique_users: row.unique_users.to_i
    }
  end

  def merge_hourly!(buckets, hour, row)
    existing = buckets[hour]
    if existing.nil?
      buckets[hour] = row_to_hourly(row)
      return
    end

    existing[:event_count] += row.event_count.to_i
    existing[:tokens_in]   += row.tokens_in.to_i
    existing[:tokens_out]  += row.tokens_out.to_i
    existing[:cost_usd]    += row.cost_usd.to_f
    existing[:unique_users] = [ existing[:unique_users], row.unique_users.to_i ].max
  end

  def merge_period!(buckets, day, event_count, cost_usd)
    key = day.to_date.iso8601
    entry = buckets[key] ||= { date: key, event_count: 0, cost_usd: 0.0 }
    entry[:event_count] += event_count.to_i
    entry[:cost_usd]    += cost_usd.to_f
  end

  def merge_tool_period!(buckets, day, event_count, tokens_in, tokens_out, cost_usd)
    key = day.to_date.iso8601
    entry = buckets[key] ||= { date: key, event_count: 0, tokens_in: 0, tokens_out: 0, cost_usd: 0.0 }
    entry[:event_count] += event_count.to_i
    entry[:tokens_in]   += tokens_in.to_i
    entry[:tokens_out]  += tokens_out.to_i
    entry[:cost_usd]    += cost_usd.to_f
  end

  def trunc_sql(granularity, timezone)
    TimezoneBucketing.period_trunc_sql_for(granularity, timezone)
  end

  def raw_period_rows(start, finish, granularity, timezone)
    scoped_raw
      .where(occurred_at: start..finish)
      .group(trunc_sql(granularity, timezone))
      .select(
        "#{trunc_sql(granularity, timezone)} as day",
        "COUNT(*) as event_count",
        "SUM(cost_usd) as cost_usd"
      )
  end

  def raw_tool_period_rows(start, finish, granularity, timezone)
    scoped_raw
      .where(occurred_at: start..finish)
      .group(trunc_sql(granularity, timezone))
      .select(
        "#{trunc_sql(granularity, timezone)} as day",
        "COUNT(*) as event_count",
        "SUM(tokens_in) as tokens_in",
        "SUM(tokens_out) as tokens_out",
        "SUM(cost_usd) as cost_usd"
      )
  end

  def raw_period_buckets(start, finish, granularity, timezone)
    buckets = {}
    raw_period_rows(start, finish, granularity, timezone).each do |row|
      merge_period!(buckets, row.day, row.event_count, row.cost_usd)
    end
    buckets.transform_values do |v|
      { date: v[:date], event_count: v[:event_count], cost_usd: v[:cost_usd].to_f }
    end
  end

  def raw_tool_period_buckets(start, finish, granularity, timezone)
    buckets = {}
    raw_tool_period_rows(start, finish, granularity, timezone).each do |row|
      merge_tool_period!(buckets, row.day, row.event_count, row.tokens_in, row.tokens_out, row.cost_usd)
    end
    buckets.transform_values do |v|
      {
        date: v[:date],
        event_count: v[:event_count],
        tokens_in: v[:tokens_in],
        tokens_out: v[:tokens_out],
        cost_usd: v[:cost_usd].to_f
      }
    end
  end

  def raw_heatmap_counts(start, finish, timezone)
    date_expr = timezone == "UTC" ? "DATE(occurred_at)" : "DATE(occurred_at AT TIME ZONE '#{timezone}')"
    scoped_raw
      .where(occurred_at: start..finish)
      .group(Arel.sql(date_expr))
      .count
      .transform_keys(&:to_s)
  end

  def raw_tool_breakdown(start, finish, _timezone)
    scoped_raw
      .where(occurred_at: start..finish)
      .group(:tool_name)
      .select("tool_name, COUNT(*) as event_count, SUM(cost_usd) as cost_usd")
      .order(Arel.sql("event_count DESC"))
      .map { |r| { tool_name: r.tool_name, event_count: r.event_count, cost_usd: (r.cost_usd || 0).to_f } }
  end
end

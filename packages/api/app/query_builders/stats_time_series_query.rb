# frozen_string_literal: true

# Hybrid reader: TimescaleDB continuous aggregates for historical ranges,
# raw tool_events for the live window (end_offset lag) and for dimensions
# CAGGs cannot represent (risk flags, non-UTC day boundaries).
class StatsTimeSeriesQuery
  HOURLY_LIVE_WINDOW = 1.hour
  DAILY_LIVE_WINDOW  = 1.day

  def initialize(organization:, project_id: nil, tool_name: nil)
    @organization = organization
    @project_id   = project_id
    @tool_name    = tool_name
  end

  def totals(start:, finish:)
    merge_totals(
      daily_aggregate_totals(start, finish),
      raw_totals(live_daily_start(start), finish)
    )
  end

  def distinct_user_count(start:, finish:)
    historical_end = [ finish, daily_live_cutoff ].min
    user_ids = Set.new

    if start < historical_end
      user_ids.merge(
        scoped_daily
          .where(bucket: start...historical_end)
          .where.not(user_id: nil)
          .distinct
          .pluck(:user_id)
      )
    end

    if finish > daily_live_cutoff
      user_ids.merge(
        scoped_raw
          .where(occurred_at: daily_live_cutoff..finish)
          .where.not(user_id: nil)
          .distinct
          .pluck(:user_id)
      )
    end

    user_ids.size
  end

  def hourly_buckets(start:, finish:)
    historical_end = [ finish, hourly_live_cutoff ].min
    buckets = {}

    if start < historical_end
      scoped_hourly
        .where(bucket: start...historical_end)
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

    if finish > hourly_live_cutoff
      live_start = [ start, hourly_live_cutoff ].max
      scoped_raw
        .where(occurred_at: live_start..finish)
        .group("DATE_TRUNC('hour', occurred_at)")
        .select(
          "DATE_TRUNC('hour', occurred_at) as hour",
          "COUNT(*) as event_count",
          "SUM(tokens_in) as tokens_in",
          "SUM(tokens_out) as tokens_out",
          "SUM(cost_usd) as cost_usd",
          "COUNT(DISTINCT user_id) as unique_users"
        )
        .each do |row|
          merge_hourly!(buckets, row.hour, row)
        end
    end

    buckets.sort_by { |hour, _| hour }.map { |_, v| v }
  end

  def period_buckets(start:, finish:, granularity: "day", timezone: "UTC")
    return raw_period_buckets(start, finish, granularity, timezone) unless timezone == "UTC"

    historical_end = [ finish, daily_live_cutoff ].min
    bucket_expr    = DailyTokenUsage.bucket_expr(granularity)
    buckets        = {}

    if start < historical_end
      scoped_daily
        .where(bucket: start...historical_end)
        .group(bucket_expr)
        .select(
          "#{bucket_expr} as day",
          "SUM(event_count) as event_count",
          "SUM(total_cost) as cost_usd"
        )
        .each { |row| merge_period!(buckets, row.day, row.event_count, row.cost_usd) }
    end

    if finish > daily_live_cutoff
      live_start = [ start, daily_live_cutoff ].max
      raw_period_rows(live_start, finish, granularity, timezone).each do |row|
        merge_period!(buckets, row.day, row.event_count, row.cost_usd)
      end
    end

    buckets.transform_values do |v|
      { date: v[:date], event_count: v[:event_count], cost_usd: v[:cost_usd].to_f }
    end
  end

  def heatmap_counts(start:, finish:, timezone: "UTC")
    return raw_heatmap_counts(start, finish, timezone) unless timezone == "UTC"

    period_buckets(start: start, finish: finish, granularity: "day", timezone: timezone)
      .transform_values { |v| v[:event_count] }
  end

  def tool_breakdown(start:, finish:, timezone: "UTC")
    return raw_tool_breakdown(start, finish, timezone) unless timezone == "UTC"

    historical_end = [ finish, daily_live_cutoff ].min
    totals_by_tool = Hash.new { |h, k| h[k] = { event_count: 0, cost_usd: 0.0 } }

    if start < historical_end
      scoped_daily
        .where(bucket: start...historical_end)
        .group(:tool_name)
        .select("tool_name, SUM(event_count) as event_count, SUM(total_cost) as cost_usd")
        .each do |row|
          totals_by_tool[row.tool_name][:event_count] += row.event_count
          totals_by_tool[row.tool_name][:cost_usd]   += row.cost_usd.to_f
        end
    end

    if finish > daily_live_cutoff
      live_start = [ start, daily_live_cutoff ].max
      scoped_raw
        .where(occurred_at: live_start..finish)
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

  attr_reader :organization, :project_id, :tool_name

  def hourly_live_cutoff = Time.current - HOURLY_LIVE_WINDOW
  def daily_live_cutoff  = Time.current - DAILY_LIVE_WINDOW

  def live_daily_start(request_start)
    [ request_start, daily_live_cutoff ].max
  end

  def scoped_hourly
    scope = HourlyTokenUsage.for_organization(organization)
    scope = scope.for_project_id(project_id) if project_id.present?
    scope = scope.for_tool(tool_name) if tool_name.present?
    scope
  end

  def scoped_daily
    scope = DailyTokenUsage.for_organization(organization)
    scope = scope.for_project_id(project_id) if project_id.present?
    scope = scope.for_tool(tool_name) if tool_name.present?
    scope
  end

  def scoped_raw
    scope = organization.tool_events
    scope = scope.where(project_id: project_id) if project_id.present?
    scope = scope.where(tool_name: tool_name) if tool_name.present?
    scope
  end

  def daily_aggregate_totals(start, finish)
    historical_end = [ finish, daily_live_cutoff ].min
    agg = { event_count: 0, cost_usd: 0.0 }

    if start < historical_end
      row = scoped_daily
        .where(bucket: start...historical_end)
        .pick(Arel.sql("COALESCE(SUM(event_count), 0)"), Arel.sql("COALESCE(SUM(total_cost), 0)"))
      agg[:event_count] += row[0].to_i
      agg[:cost_usd]    += row[1].to_f
    end

    agg
  end

  def raw_totals(start, finish)
    return { event_count: 0, cost_usd: 0.0 } if finish < start

    scope = scoped_raw.where(occurred_at: start..finish)
    { event_count: scope.count, cost_usd: scope.sum(:cost_usd).to_f }
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

    # Cannot sum unique_users across slices — recompute from distinct if both slices present.
    # For live+historical boundary at hour boundary this is rare; use max as conservative fallback
    # only when merging partial hours (same hour in both slices shouldn't happen with hour cutoff).
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

  def trunc_sql(granularity, timezone)
    trunc = %w[day week month].include?(granularity) ? granularity : "day"
    expr = timezone == "UTC" ? "DATE_TRUNC('#{trunc}', occurred_at)" : "DATE_TRUNC('#{trunc}', occurred_at AT TIME ZONE '#{timezone}')"
    Arel.sql(expr)
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

  def raw_period_buckets(start, finish, granularity, timezone)
    buckets = {}
    raw_period_rows(start, finish, granularity, timezone).each do |row|
      merge_period!(buckets, row.day, row.event_count, row.cost_usd)
    end
    buckets.transform_values do |v|
      { date: v[:date], event_count: v[:event_count], cost_usd: v[:cost_usd].to_f }
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

  def raw_tool_breakdown(start, finish, timezone)
    # timezone irrelevant for tool breakdown totals; use raw for non-UTC path consistency
    scoped_raw
      .where(occurred_at: start..finish)
      .group(:tool_name)
      .select("tool_name, COUNT(*) as event_count, SUM(cost_usd) as cost_usd")
      .order(Arel.sql("event_count DESC"))
      .map { |r| { tool_name: r.tool_name, event_count: r.event_count, cost_usd: (r.cost_usd || 0).to_f } }
  end
end

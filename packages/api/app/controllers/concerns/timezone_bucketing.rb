# frozen_string_literal: true

module TimezoneBucketing
  extend ActiveSupport::Concern

  VALID_TIMEZONES = TZInfo::Timezone.all_identifiers.to_set.freeze

  # Shared SQL helpers — callable from both controllers (via the concern) and
  # plain Ruby objects (e.g. StatsTimeSeriesQuery) via TimezoneBucketing.period_trunc_sql_for.
  module_function

  def period_trunc_sql_for(granularity, timezone)
    trunc = %w[day week month].include?(granularity) ? granularity : "day"
    expr  = timezone == "UTC" ? "DATE_TRUNC('#{trunc}', occurred_at)" : "DATE_TRUNC('#{trunc}', occurred_at AT TIME ZONE '#{timezone}')"
    Arel.sql(expr)
  end

  private

  def client_timezone
    @client_timezone ||= begin
      tz = params[:tz].presence
      tz && VALID_TIMEZONES.include?(tz) ? tz : "UTC"
    end
  end

  # ActiveSupport::TimeZone for the validated ?tz identifier (cf. Time.zone).
  # Use for range boundaries (beginning_of_day etc.) so they match the SQL
  # bucketing below, which interpolates the client_timezone string.
  def client_zone
    @client_zone ||= ActiveSupport::TimeZone[client_timezone]
  end

  def day_trunc_sql
    tz = client_timezone
    expr = tz == "UTC" ? "DATE_TRUNC('day', occurred_at)" : "DATE_TRUNC('day', occurred_at AT TIME ZONE '#{tz}')"
    Arel.sql(expr)
  end

  def period_trunc_sql(trunc)
    period_trunc_sql_for(trunc, client_timezone)
  end

  def date_sql
    tz = client_timezone
    expr = tz == "UTC" ? "DATE(occurred_at)" : "DATE(occurred_at AT TIME ZONE '#{tz}')"
    Arel.sql(expr)
  end
end

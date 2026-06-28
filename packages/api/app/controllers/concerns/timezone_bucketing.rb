# frozen_string_literal: true

module TimezoneBucketing
  extend ActiveSupport::Concern

  VALID_TIMEZONES = TZInfo::Timezone.all_identifiers.to_set.freeze

  private

  def client_timezone
    @client_timezone ||= begin
      tz = params[:tz].presence
      tz && VALID_TIMEZONES.include?(tz) ? tz : "UTC"
    end
  end

  def day_trunc_sql
    tz = client_timezone
    expr = tz == "UTC" ? "DATE_TRUNC('day', occurred_at)" : "DATE_TRUNC('day', occurred_at AT TIME ZONE '#{tz}')"
    Arel.sql(expr)
  end

  def period_trunc_sql(trunc)
    trunc = %w[day week month].include?(trunc) ? trunc : "day"
    tz = client_timezone
    expr = tz == "UTC" ? "DATE_TRUNC('#{trunc}', occurred_at)" : "DATE_TRUNC('#{trunc}', occurred_at AT TIME ZONE '#{tz}')"
    Arel.sql(expr)
  end

  def date_sql
    tz = client_timezone
    expr = tz == "UTC" ? "DATE(occurred_at)" : "DATE(occurred_at AT TIME ZONE '#{tz}')"
    Arel.sql(expr)
  end
end

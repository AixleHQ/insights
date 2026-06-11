# frozen_string_literal: true

require "csv"

# Builds personal usage reports scoped strictly to a single user's tool events.
#
# Supported report types:
#   my_cost_by_tool    — cost and token totals grouped by tool
#   my_token_by_tool   — token breakdown (in/out) grouped by tool
#   my_cost_by_project — cost and token totals grouped by project
#   my_events          — flat list of raw events (no aggregation)
class PersonalReportQueryBuilder
  Result = Data.define(:rows, :columns)

  DateRangeTooLargeError = Class.new(StandardError)

  VALID_REPORT_TYPES  = %w[my_cost_by_tool my_token_by_tool my_cost_by_project my_events].freeze
  VALID_FORMATS       = %w[csv json].freeze
  MAX_DATE_RANGE_DAYS = 366

  COLUMNS = {
    "my_cost_by_tool"    => %w[tool_name total_cost_usd total_tokens event_count],
    "my_token_by_tool"   => %w[tool_name input_tokens output_tokens total_tokens],
    "my_cost_by_project" => %w[project_name total_cost_usd total_tokens],
    "my_events"          => %w[occurred_at tool_name event_type tokens_in tokens_out cost_usd project_name]
  }.freeze

  def initialize(user:, params:)
    @user        = user
    @report_type = params[:report_type].to_s
    @from        = parse_date(params[:from])
    @to          = parse_date(params[:to], end_of_day: true)
  end

  def call
    validate_date_range!
    rows    = send(@report_type).map { |r| serialize_row(r) }
    columns = COLUMNS[@report_type]
    Result.new(rows: rows, columns: columns)
  end

  def to_csv(result)
    CSV.generate(headers: true) do |csv|
      csv << result.columns
      result.rows.each { |row| csv << result.columns.map { |col| sanitize_csv_cell(row[col]) } }
    end
  end

  private

  def validate_date_range!
    range_days = (@to - @from) / 1.day
    if range_days > MAX_DATE_RANGE_DAYS
      raise DateRangeTooLargeError,
        "Date range exceeds #{MAX_DATE_RANGE_DAYS} days. Please narrow your query."
    end
  end

  def sanitize_csv_cell(value)
    return value unless value.is_a?(String)
    return value unless value.start_with?("=", "+", "-", "@", "\t", "\r")

    "'#{value}"
  end

  def base_scope
    @user.tool_events.where(occurred_at: @from..@to)
  end

  def my_cost_by_tool
    base_scope
      .group(:tool_name)
      .select(
        Arel.sql(
          "tool_name,
           SUM(cost_usd) AS total_cost_usd,
           SUM(tokens_in + tokens_out) AS total_tokens,
           COUNT(*) AS event_count"
        )
      )
      .order(Arel.sql("SUM(cost_usd) DESC"))
  end

  def my_token_by_tool
    base_scope
      .group(:tool_name)
      .select(
        Arel.sql(
          "tool_name,
           SUM(tokens_in) AS input_tokens,
           SUM(tokens_out) AS output_tokens,
           SUM(tokens_in + tokens_out) AS total_tokens"
        )
      )
      .order(Arel.sql("SUM(tokens_in + tokens_out) DESC"))
  end

  def my_cost_by_project
    base_scope
      .joins("LEFT JOIN projects ON projects.id = tool_events.project_id")
      .where.not(project_id: nil)
      .group("projects.id", "projects.name")
      .select(
        Arel.sql(
          "projects.name AS project_name,
           SUM(tool_events.cost_usd) AS total_cost_usd,
           SUM(tool_events.tokens_in + tool_events.tokens_out) AS total_tokens"
        )
      )
      .order(Arel.sql("SUM(tool_events.cost_usd) DESC"))
  end

  def my_events
    base_scope
      .joins("LEFT JOIN projects ON projects.id = tool_events.project_id")
      .select(
        Arel.sql(
          "tool_events.occurred_at,
           tool_events.tool_name,
           tool_events.event_type,
           tool_events.tokens_in,
           tool_events.tokens_out,
           tool_events.cost_usd,
           projects.name AS project_name"
        )
      )
      .order("tool_events.occurred_at DESC")
  end

  def serialize_row(row)
    COLUMNS[@report_type].each_with_object({}) do |col, hash|
      hash[col] = coerce_value(col, row.public_send(col))
    end
  end

  def coerce_value(col, val)
    case col
    when "total_cost_usd", "cost_usd"            then val.to_f.round(6)
    when "total_tokens", "input_tokens",
         "output_tokens", "event_count",
         "tokens_in", "tokens_out"               then val.to_i
    when "occurred_at"                           then val&.iso8601
    else val
    end
  end

  def parse_date(val, end_of_day: false)
    return end_of_day ? Time.current : 30.days.ago.beginning_of_day if val.blank?

    parsed = Time.zone.parse(val.to_s)
    end_of_day ? parsed.end_of_day : parsed.beginning_of_day
  rescue ArgumentError, TypeError
    end_of_day ? Time.current : 30.days.ago.beginning_of_day
  end
end

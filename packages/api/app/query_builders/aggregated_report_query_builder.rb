# frozen_string_literal: true

# Builds aggregated usage reports for an organization.
#
# Supported report types:
#   cost_by_user    — cost and token totals grouped by user
#   cost_by_project — cost and token totals grouped by project
#   cost_by_tool    — cost and token totals grouped by tool
#   token_by_user   — token breakdown (in/out) grouped by user
#   token_by_tool   — token breakdown (in/out) grouped by tool
#
# Optional group_by (day | week | month) appends a `period` column to every row.
class AggregatedReportQueryBuilder
  Result = Data.define(:rows, :columns)

  COLUMNS = {
    "cost_by_user"    => %w[user_id user_name total_cost_usd total_tokens tool_count],
    "cost_by_project" => %w[project_id project_name total_cost_usd total_tokens],
    "cost_by_tool"    => %w[tool_name total_cost_usd total_tokens event_count],
    "token_by_user"   => %w[user_id user_name input_tokens output_tokens total_tokens],
    "token_by_tool"   => %w[tool_name input_tokens output_tokens total_tokens]
  }.freeze

  TRUNC_INTERVALS = { "day" => "day", "week" => "week", "month" => "month" }.freeze

  def initialize(organization:, params:)
    @organization = organization
    @report_type  = params[:report_type].to_s
    @group_by     = TRUNC_INTERVALS[params[:group_by].to_s]
    @project_id   = params[:project_id]
    @from         = parse_date(params[:from])
    @to           = parse_date(params[:to], end_of_day: true)
  end

  def call
    rows    = send(@report_type).map { |r| serialize_row(r) }
    columns = COLUMNS[@report_type] + (@group_by ? [ "period" ] : [])
    Result.new(rows: rows, columns: columns)
  end

  private

  def base_scope
    scope = if @project_id.present?
      @organization.projects.find(@project_id).tool_events
    else
      @organization.tool_events
    end
    scope.where(occurred_at: @from..@to)
  end

  # DATE_TRUNC select fragment when group_by is set
  def bucket_select
    @group_by ? [ "DATE_TRUNC('#{@group_by}', occurred_at) AS period" ] : []
  end

  # GROUP BY fragment when group_by is set
  def bucket_group
    @group_by ? [ Arel.sql("DATE_TRUNC('#{@group_by}', occurred_at)") ] : []
  end

  def cost_by_user
    base_scope
      .joins(:user)
      .group("users.id", "users.name", *bucket_group)
      .select(
        Arel.sql(
          "users.id AS user_id, users.name AS user_name,
           SUM(tool_events.cost_usd) AS total_cost_usd,
           SUM(tool_events.tokens_in + tool_events.tokens_out) AS total_tokens,
           COUNT(DISTINCT tool_events.tool_name) AS tool_count" +
          (bucket_select.any? ? ", #{bucket_select.join(', ')}" : "")
        )
      )
      .order(Arel.sql("SUM(tool_events.cost_usd) DESC"))
  end

  def cost_by_project
    base_scope
      .joins("LEFT JOIN projects ON projects.id = tool_events.project_id")
      .where.not(project_id: nil)
      .group("projects.id", "projects.name", *bucket_group)
      .select(
        Arel.sql(
          "projects.id AS project_id, projects.name AS project_name,
           SUM(tool_events.cost_usd) AS total_cost_usd,
           SUM(tool_events.tokens_in + tool_events.tokens_out) AS total_tokens" +
          (bucket_select.any? ? ", #{bucket_select.join(', ')}" : "")
        )
      )
      .order(Arel.sql("SUM(tool_events.cost_usd) DESC"))
  end

  def cost_by_tool
    base_scope
      .group(:tool_name, *bucket_group)
      .select(
        Arel.sql(
          "tool_name,
           SUM(cost_usd) AS total_cost_usd,
           SUM(tokens_in + tokens_out) AS total_tokens,
           COUNT(*) AS event_count" +
          (bucket_select.any? ? ", #{bucket_select.join(', ')}" : "")
        )
      )
      .order(Arel.sql("SUM(cost_usd) DESC"))
  end

  def token_by_user
    base_scope
      .joins(:user)
      .group("users.id", "users.name", *bucket_group)
      .select(
        Arel.sql(
          "users.id AS user_id, users.name AS user_name,
           SUM(tool_events.tokens_in) AS input_tokens,
           SUM(tool_events.tokens_out) AS output_tokens,
           SUM(tool_events.tokens_in + tool_events.tokens_out) AS total_tokens" +
          (bucket_select.any? ? ", #{bucket_select.join(', ')}" : "")
        )
      )
      .order(Arel.sql("SUM(tool_events.tokens_in + tool_events.tokens_out) DESC"))
  end

  def token_by_tool
    base_scope
      .group(:tool_name, *bucket_group)
      .select(
        Arel.sql(
          "tool_name,
           SUM(tokens_in) AS input_tokens,
           SUM(tokens_out) AS output_tokens,
           SUM(tokens_in + tokens_out) AS total_tokens" +
          (bucket_select.any? ? ", #{bucket_select.join(', ')}" : "")
        )
      )
      .order(Arel.sql("SUM(tokens_in + tokens_out) DESC"))
  end

  def serialize_row(row)
    hash = COLUMNS[@report_type].each_with_object({}) do |col, h|
      h[col] = coerce_value(col, row.public_send(col))
    end
    hash["period"] = row.period&.iso8601 if @group_by
    hash
  end

  def coerce_value(col, val)
    case col
    when "total_cost_usd"          then val.to_f.round(6)
    when "total_tokens", "input_tokens", "output_tokens", "event_count", "tool_count" then val.to_i
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

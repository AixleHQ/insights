# frozen_string_literal: true

# Applies server-side ORDER BY to a ToolEvent scope based on request params.
#
# Whitelists column names and directions to prevent SQL injection.
# Falls back to `occurred_at DESC` for unknown or missing values.
# A stable `occurred_at DESC` tiebreak is always appended.
#
# Usage:
#   events = ToolEventSortScope.new(scope: events, params: params).call
class ToolEventSortScope
  SORTABLE_COLUMNS = %w[occurred_at cost_usd tokens_in tool_name risk_level].freeze
  SORT_DIRECTIONS  = %w[asc desc].freeze

  def initialize(scope:, params:)
    @scope  = scope
    @params = params
  end

  def call
    col = sanitized_column
    dir = sanitized_direction

    if col == "risk_level"
      @scope.order(risk_level_case_sql(dir))
    else
      @scope.order(standard_sort_sql(col, dir))
    end
  end

  private

  def sanitized_column
    col = @params[:sort_by].presence
    SORTABLE_COLUMNS.include?(col) ? col : "occurred_at"
  end

  def sanitized_direction
    dir = @params[:direction].presence
    SORT_DIRECTIONS.include?(dir) ? dir : "desc"
  end

  def risk_level_case_sql(dir)
    Arel.sql(
      "CASE metadata->>'risk_level'
         WHEN 'critical' THEN 4
         WHEN 'high'     THEN 3
         WHEN 'medium'   THEN 2
         WHEN 'low'      THEN 1
         ELSE 0
       END #{dir.upcase}, occurred_at DESC, id DESC"
    )
  end

  def standard_sort_sql(col, dir)
    Arel.sql("#{col} #{dir.upcase} NULLS LAST, occurred_at DESC, id DESC")
  end
end

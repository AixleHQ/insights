# frozen_string_literal: true

# Applies server-side ORDER BY to a ToolEvent scope based on request params.
#
# Whitelists column names and directions to prevent SQL injection.
# Falls back to `occurred_at DESC` for unknown or missing values.
# A stable `occurred_at DESC, id DESC` tiebreak is always appended.
#
# Brakeman note: Arel.sql receives only prebuilt string literals from
# COLUMN_SORT_SQL / RISK_LEVEL_SORT_SQL — no user input is interpolated.
#
# Usage:
#   events = ToolEventSortScope.new(scope: events, params: params).call
class ToolEventSortScope
  SORTABLE_COLUMNS = %w[occurred_at cost_usd tokens_in tool_name risk_level].freeze
  SORT_DIRECTIONS  = %w[asc desc].freeze

  # Pre-built, immutable SQL fragments — only these are ever passed to Arel.sql.
  COLUMN_SORT_SQL = {
    %w[occurred_at asc]  => Arel.sql("occurred_at ASC  NULLS LAST, id ASC"),
    %w[occurred_at desc] => Arel.sql("occurred_at DESC NULLS LAST, id DESC"),
    %w[cost_usd asc]     => Arel.sql("cost_usd ASC  NULLS LAST, occurred_at ASC,  id ASC"),
    %w[cost_usd desc]    => Arel.sql("cost_usd DESC NULLS LAST, occurred_at DESC, id DESC"),
    %w[tokens_in asc]    => Arel.sql("tokens_in ASC  NULLS LAST, occurred_at ASC,  id ASC"),
    %w[tokens_in desc]   => Arel.sql("tokens_in DESC NULLS LAST, occurred_at DESC, id DESC"),
    %w[tool_name asc]    => Arel.sql("tool_name ASC  NULLS LAST, occurred_at ASC,  id ASC"),
    %w[tool_name desc]   => Arel.sql("tool_name DESC NULLS LAST, occurred_at DESC, id DESC")
  }.freeze

  RISK_LEVEL_SORT_SQL = {
    "asc"  => Arel.sql(
      "CASE metadata->>'risk_level' WHEN 'critical' THEN 4 WHEN 'high' THEN 3 " \
      "WHEN 'medium' THEN 2 WHEN 'low' THEN 1 ELSE 0 END ASC,  occurred_at ASC,  id ASC"
    ),
    "desc" => Arel.sql(
      "CASE metadata->>'risk_level' WHEN 'critical' THEN 4 WHEN 'high' THEN 3 " \
      "WHEN 'medium' THEN 2 WHEN 'low' THEN 1 ELSE 0 END DESC, occurred_at DESC, id DESC"
    )
  }.freeze

  def initialize(scope:, params:)
    @scope  = scope
    @params = params
  end

  def call
    col = sanitized_column
    dir = sanitized_direction

    if col == "risk_level"
      @scope.order(RISK_LEVEL_SORT_SQL[dir])
    else
      @scope.order(COLUMN_SORT_SQL[[ col, dir ]])
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
end

# frozen_string_literal: true

class FixToolEventsSortIndexesNullOrdering < ActiveRecord::Migration[8.1]
  disable_ddl_transaction!

  # AIX-334: cost_usd / tokens_in conceptually default to 0, so NULL rows
  # should sort as the lowest value in both directions. Plain DESC relied on
  # Postgres's implicit NULLS FIRST, which put NULL rows first instead of
  # last. Making NULLS ordering explicit here (and in ToolEventSortScope)
  # keeps one index serving both scan directions: a forward scan matches
  # DESC NULLS LAST, a backward scan matches ASC NULLS FIRST.
  #
  # TimescaleDB hypertables do NOT support CONCURRENTLY — see AddPerformanceIndexes.
  # This briefly blocks writes to tool_events on deploy.
  def up
    execute "DROP INDEX IF EXISTS timeseries.idx_tool_events_org_cost_occurred"
    execute <<-SQL
      CREATE INDEX IF NOT EXISTS idx_tool_events_org_cost_occurred
        ON timeseries.tool_events (organization_id, cost_usd DESC NULLS LAST, occurred_at DESC, id DESC);
    SQL

    execute "DROP INDEX IF EXISTS timeseries.idx_tool_events_org_tokens_in_occurred"
    execute <<-SQL
      CREATE INDEX IF NOT EXISTS idx_tool_events_org_tokens_in_occurred
        ON timeseries.tool_events (organization_id, tokens_in DESC NULLS LAST, occurred_at DESC, id DESC);
    SQL
  end

  def down
    execute "DROP INDEX IF EXISTS timeseries.idx_tool_events_org_cost_occurred"
    execute <<-SQL
      CREATE INDEX IF NOT EXISTS idx_tool_events_org_cost_occurred
        ON timeseries.tool_events (organization_id, cost_usd DESC, occurred_at DESC, id DESC);
    SQL

    execute "DROP INDEX IF EXISTS timeseries.idx_tool_events_org_tokens_in_occurred"
    execute <<-SQL
      CREATE INDEX IF NOT EXISTS idx_tool_events_org_tokens_in_occurred
        ON timeseries.tool_events (organization_id, tokens_in DESC, occurred_at DESC, id DESC);
    SQL
  end
end

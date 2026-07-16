# frozen_string_literal: true

class AddToolEventsSortIndexes < ActiveRecord::Migration[8.1]
  disable_ddl_transaction!

  def up
    # Composite indexes for server-side Events list sorting (AIX-334).
    # Scoped by organization_id to match authorized_scope queries.
    # Tie-break columns (occurred_at, id) align with ToolEventSortScope ORDER BY.
    #
    # Plain DESC (= NULLS FIRST) is deliberate: a forward scan serves
    # DESC NULLS FIRST and a backward scan serves ASC NULLS LAST, so one
    # index covers both sort directions emitted by ToolEventSortScope.
    # Do not add NULLS LAST here without changing the scope's SQL fragments.
    #
    # TimescaleDB hypertables do NOT support CONCURRENTLY — see AddPerformanceIndexes.
    execute <<-SQL
      CREATE INDEX IF NOT EXISTS idx_tool_events_org_cost_occurred
        ON timeseries.tool_events (organization_id, cost_usd DESC, occurred_at DESC, id DESC);
    SQL

    execute <<-SQL
      CREATE INDEX IF NOT EXISTS idx_tool_events_org_tokens_in_occurred
        ON timeseries.tool_events (organization_id, tokens_in DESC, occurred_at DESC, id DESC);
    SQL
  end

  def down
    execute "DROP INDEX IF EXISTS timeseries.idx_tool_events_org_cost_occurred"
    execute "DROP INDEX IF EXISTS timeseries.idx_tool_events_org_tokens_in_occurred"
  end
end

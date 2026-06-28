# frozen_string_literal: true

class AddPerformanceIndexes < ActiveRecord::Migration[8.1]
  disable_ddl_transaction!

  def up
    # Composite index for dashboard KPI queries filtered by org + tool + date range.
    # Uses raw SQL because tool_events is a TimescaleDB hypertable (timeseries schema)
    # — add_index does not resolve the schema prefix correctly.
    #
    # NOTE: TimescaleDB hypertables do NOT support CONCURRENTLY index creation.
    # The index is created without CONCURRENTLY; TimescaleDB propagates it to all
    # existing and future chunks automatically. In production this takes a brief
    # ACCESS SHARE lock (not ACCESS EXCLUSIVE), so it is safe to run online.
    execute <<-SQL
      CREATE INDEX IF NOT EXISTS idx_tool_events_org_tool_occurred
        ON timeseries.tool_events (organization_id, tool_name, occurred_at DESC);
    SQL

    # Composite index for audit trail pagination filtered by org + date range.
    # audit_logs is a regular table — CONCURRENTLY is safe and avoids any table lock.
    execute <<-SQL
      CREATE INDEX CONCURRENTLY IF NOT EXISTS index_audit_logs_on_organization_id_and_created_at
        ON public.audit_logs (organization_id, created_at DESC);
    SQL
  end

  def down
    execute "DROP INDEX IF EXISTS timeseries.idx_tool_events_org_tool_occurred"
    execute "DROP INDEX CONCURRENTLY IF EXISTS public.index_audit_logs_on_organization_id_and_created_at"
  end
end

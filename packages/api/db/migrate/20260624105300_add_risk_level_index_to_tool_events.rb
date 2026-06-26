# frozen_string_literal: true

class AddRiskLevelIndexToToolEvents < ActiveRecord::Migration[8.0]
  # TimescaleDB hypertables do not support CREATE INDEX CONCURRENTLY — attempting it
  # raises PG::FeatureNotSupported. disable_ddl_transaction! + algorithm: :concurrently
  # is therefore intentionally omitted. The AccessExclusiveLock risk is mitigated by
  # if_not_exists: true: long-running environments already have this index (carried by
  # structure.sql), so the lock is only taken on a first-ever deploy or a fresh DB.
  def change
    add_index "timeseries.tool_events",
              "(metadata->>'risk_level')",
              name: "index_tool_events_on_metadata_risk_level",
              where: "metadata->>'risk_level' IS NOT NULL",
              if_not_exists: true
  end
end

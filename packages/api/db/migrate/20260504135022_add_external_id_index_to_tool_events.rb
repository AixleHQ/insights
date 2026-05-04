# frozen_string_literal: true

class AddExternalIdIndexToToolEvents < ActiveRecord::Migration[8.1]
  def up
    # Composite expression index on (organization_id, metadata->>'external_id')
    # for fast dedup lookups in AiUsageSyncJob#find_matching_event.
    #
    # All dedup queries are scoped to a single organization, so the composite
    # index allows PostgreSQL to use an index scan rather than a filter scan
    # after the expression lookup.
    #
    # Why non-unique: tool_events is a TimescaleDB hypertable partitioned by
    # occurred_at. TimescaleDB requires UNIQUE indexes to include the partitioning
    # column. Including occurred_at would allow the same external_id to exist at
    # different timestamps. Uniqueness is enforced at the application layer
    # (see AiUsageSyncJob#find_matching_event).
    #
    # Compressed chunks: expression indexes are not maintained on compressed
    # chunks (older than 7 days). Lookups against those chunks will do a
    # decompression scan. This is acceptable — re-syncing data older than 7 days
    # is uncommon and handled by the OPENROUTER_RECURRING_OVERLAP_DAYS overlap.
    execute <<-SQL
      CREATE INDEX idx_tool_events_external_id
        ON timeseries.tool_events (organization_id, (metadata->>'external_id'))
        WHERE metadata->>'external_id' IS NOT NULL;
    SQL
  end

  def down
    execute "DROP INDEX IF EXISTS timeseries.idx_tool_events_external_id"
  end
end

class AddSessionIdIndexToToolEvents < ActiveRecord::Migration[8.1]
  def up
    # Non-unique expression index on metadata->>'session_id' for fast dedup lookups.
    #
    # Why non-unique: tool_events is a TimescaleDB hypertable partitioned by
    # occurred_at, and TimescaleDB requires UNIQUE indexes to include the
    # partitioning column. Including occurred_at in a uniqueness constraint would
    # allow the same session to have multiple rows at different timestamps, which
    # is exactly what we're trying to prevent. Uniqueness is enforced at the
    # application layer (see ToolEvents::Upsert service).
    #
    # Compressed chunks: TimescaleDB does not maintain expression indexes on
    # compressed chunks (chunks older than 7 days). Lookups against compressed
    # chunks will do a decompression scan. This is acceptable because re-sends of
    # the same session are only realistic for recent (uncompressed) data.
    execute <<-SQL
      CREATE INDEX idx_tool_events_session_id
        ON timeseries.tool_events ((metadata->>'session_id'))
        WHERE metadata->>'session_id' IS NOT NULL;
    SQL
  end

  def down
    execute "DROP INDEX IF EXISTS timeseries.idx_tool_events_session_id"
  end
end

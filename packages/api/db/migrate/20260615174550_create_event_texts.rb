# frozen_string_literal: true

class CreateEventTexts < ActiveRecord::Migration[8.1]
  def up
    execute <<-SQL
      CREATE TABLE timeseries.event_texts (
        tool_event_id UUID NOT NULL,
        occurred_at   TIMESTAMPTZ NOT NULL,
        user_text     TEXT,
        assistant_text TEXT,
        sanitized_at  TIMESTAMPTZ,
        sanitizer_version VARCHAR(16),
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        -- Logical FK to timeseries.tool_events(id, occurred_at).
        -- A real FK is invalid: tool_events PK is composite (id, occurred_at)
        -- and TimescaleDB does not support FK constraints referencing a hypertable.
        -- tool_event_id is always populated from a just-persisted PersistenceActivity result.
        PRIMARY KEY (tool_event_id, occurred_at)
      );
    SQL

    execute <<-SQL
      SELECT create_hypertable(
        'timeseries.event_texts',
        by_range('occurred_at', INTERVAL '1 day')
      );
    SQL

    execute <<-SQL
      CREATE INDEX idx_event_texts_tool_event_id ON timeseries.event_texts (tool_event_id);
    SQL

    execute <<-SQL
      ALTER TABLE timeseries.event_texts SET (
        timescaledb.compress,
        timescaledb.compress_orderby = 'occurred_at DESC'
      );
      SELECT add_compression_policy('timeseries.event_texts', INTERVAL '7 days');
    SQL

    execute <<-SQL
      SELECT add_retention_policy('timeseries.event_texts', INTERVAL '90 days');
    SQL
  end

  def down
    execute "DROP TABLE IF EXISTS timeseries.event_texts CASCADE"
  end
end

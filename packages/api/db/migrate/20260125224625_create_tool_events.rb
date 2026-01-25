class CreateToolEvents < ActiveRecord::Migration[8.1]
  def up
    # Create the tool_events table in the timeseries schema
    execute <<-SQL
      CREATE TABLE timeseries.tool_events (
        id UUID DEFAULT gen_random_uuid() NOT NULL,
        user_id UUID NOT NULL REFERENCES users(id),
        organization_id UUID NOT NULL REFERENCES organizations(id),
        project_id UUID REFERENCES projects(id),
        repository_id UUID REFERENCES repositories(id),
        tool_name tool_name NOT NULL,
        event_type event_type NOT NULL,
        model VARCHAR(255),
        tokens_in INTEGER DEFAULT 0,
        tokens_out INTEGER DEFAULT 0,
        tokens_total INTEGER DEFAULT 0,
        cost_usd DECIMAL(10, 6) DEFAULT 0,
        metadata JSONB DEFAULT '{}',
        occurred_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (id, occurred_at)
      );
    SQL

    # Convert to hypertable
    execute <<-SQL
      SELECT create_hypertable(
        'timeseries.tool_events',
        by_range('occurred_at', INTERVAL '1 day')
      );
    SQL

    # Add indexes for common queries
    execute <<-SQL
      CREATE INDEX idx_tool_events_user_occurred ON timeseries.tool_events (user_id, occurred_at DESC);
      CREATE INDEX idx_tool_events_org_occurred ON timeseries.tool_events (organization_id, occurred_at DESC);
      CREATE INDEX idx_tool_events_project_occurred ON timeseries.tool_events (project_id, occurred_at DESC);
      CREATE INDEX idx_tool_events_tool_occurred ON timeseries.tool_events (tool_name, occurred_at DESC);
    SQL

    # Add compression policy - compress chunks older than 7 days
    execute <<-SQL
      ALTER TABLE timeseries.tool_events SET (
        timescaledb.compress,
        timescaledb.compress_segmentby = 'organization_id, user_id',
        timescaledb.compress_orderby = 'occurred_at DESC'
      );
      SELECT add_compression_policy('timeseries.tool_events', INTERVAL '7 days');
    SQL

    # Add retention policy - drop chunks older than 730 days (system-wide ceiling)
    execute <<-SQL
      SELECT add_retention_policy('timeseries.tool_events', INTERVAL '730 days');
    SQL
  end

  def down
    execute "DROP TABLE IF EXISTS timeseries.tool_events CASCADE"
  end
end

class CreateContinuousAggregates < ActiveRecord::Migration[8.1]
  def up
    # Create hourly token usage continuous aggregate
    execute <<-SQL
      CREATE MATERIALIZED VIEW timeseries.hourly_token_usage
      WITH (timescaledb.continuous) AS
      SELECT
        time_bucket('1 hour', occurred_at) AS bucket,
        organization_id,
        user_id,
        project_id,
        tool_name,
        event_type,
        COUNT(*) AS event_count,
        SUM(tokens_in) AS total_tokens_in,
        SUM(tokens_out) AS total_tokens_out,
        SUM(tokens_total) AS total_tokens,
        SUM(cost_usd) AS total_cost
      FROM timeseries.tool_events
      GROUP BY bucket, organization_id, user_id, project_id, tool_name, event_type
      WITH NO DATA;
    SQL

    # Add refresh policy for hourly aggregate - refresh every hour
    execute <<-SQL
      SELECT add_continuous_aggregate_policy('timeseries.hourly_token_usage',
        start_offset => INTERVAL '3 hours',
        end_offset => INTERVAL '1 hour',
        schedule_interval => INTERVAL '1 hour'
      );
    SQL

    # Create daily token usage continuous aggregate
    execute <<-SQL
      CREATE MATERIALIZED VIEW timeseries.daily_token_usage
      WITH (timescaledb.continuous) AS
      SELECT
        time_bucket('1 day', occurred_at) AS bucket,
        organization_id,
        user_id,
        project_id,
        tool_name,
        event_type,
        COUNT(*) AS event_count,
        SUM(tokens_in) AS total_tokens_in,
        SUM(tokens_out) AS total_tokens_out,
        SUM(tokens_total) AS total_tokens,
        SUM(cost_usd) AS total_cost
      FROM timeseries.tool_events
      GROUP BY bucket, organization_id, user_id, project_id, tool_name, event_type
      WITH NO DATA;
    SQL

    # Add refresh policy for daily aggregate - refresh daily
    execute <<-SQL
      SELECT add_continuous_aggregate_policy('timeseries.daily_token_usage',
        start_offset => INTERVAL '3 days',
        end_offset => INTERVAL '1 day',
        schedule_interval => INTERVAL '1 day'
      );
    SQL

    # Add retention policies for aggregates
    execute <<-SQL
      SELECT add_retention_policy('timeseries.hourly_token_usage', INTERVAL '730 days');
      SELECT add_retention_policy('timeseries.daily_token_usage', INTERVAL '1095 days');
    SQL
  end

  def down
    execute "DROP MATERIALIZED VIEW IF EXISTS timeseries.daily_token_usage CASCADE"
    execute "DROP MATERIALIZED VIEW IF EXISTS timeseries.hourly_token_usage CASCADE"
  end
end

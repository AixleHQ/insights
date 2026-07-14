# frozen_string_literal: true

module ContinuousAggregateRefresh
  REFRESH_MUTEX = Mutex.new

  def refresh_hourly_token_usage!
    REFRESH_MUTEX.synchronize do
      ensure_continuous_aggregates! unless continuous_aggregates_ready?
      ActiveRecord::Base.connection.execute(
        "CALL refresh_continuous_aggregate('timeseries.hourly_token_usage', NULL, NULL);"
      )
    end
  end

  def refresh_daily_token_usage!
    REFRESH_MUTEX.synchronize do
      ensure_continuous_aggregates! unless continuous_aggregates_ready?
      ActiveRecord::Base.connection.execute(
        "CALL refresh_continuous_aggregate('timeseries.daily_token_usage', NULL, NULL);"
      )
    end
  end

  def refresh_all_token_usage_aggregates!
    refresh_hourly_token_usage!
    refresh_daily_token_usage!
  end

  def ensure_continuous_aggregates!
    return if continuous_aggregates_ready?

    conn = ActiveRecord::Base.connection
    ensure_tool_events_hypertable!(conn)
    drop_stale_aggregate_artifacts!(conn)
    load_migration("20260125224628_create_continuous_aggregates.rb").new.up
  end

  private

  def continuous_aggregates_ready?
    rows = ActiveRecord::Base.connection.select_values(
      "SELECT view_name FROM timescaledb_information.continuous_aggregates " \
      "WHERE view_name IN ('hourly_token_usage', 'daily_token_usage')"
    )
    rows.sort == %w[daily_token_usage hourly_token_usage]
  end

  def ensure_tool_events_hypertable!(conn)
    return if conn.select_value(
      "SELECT 1 FROM timescaledb_information.hypertables " \
      "WHERE hypertable_schema = 'timeseries' AND hypertable_name = 'tool_events' LIMIT 1"
    )

    conn.execute(
      "SELECT create_hypertable(" \
      "'timeseries.tool_events', by_range('occurred_at', INTERVAL '1 day'), " \
      "if_not_exists => TRUE, migrate_data => TRUE)"
    )
  end

  def drop_stale_aggregate_artifacts!(conn)
    %w[hourly_token_usage daily_token_usage].each do |view|
      drop_relation!(conn, "timeseries", view)
    end

    %w[
      _direct_view_3 _direct_view_4 _partial_view_3 _partial_view_4
      _materialized_hypertable_3 _materialized_hypertable_4
    ].each do |name|
      drop_relation!(conn, "_timescaledb_internal", name)
    end
  end

  def drop_relation!(conn, schema, name)
    [
      "DROP VIEW IF EXISTS #{schema}.#{name} CASCADE",
      "DROP MATERIALIZED VIEW IF EXISTS #{schema}.#{name} CASCADE",
      "DROP TABLE IF EXISTS #{schema}.#{name} CASCADE"
    ].each do |sql|
      conn.execute(sql)
    rescue ActiveRecord::StatementInvalid
      nil
    end
  end

  def load_migration(filename)
    path = Rails.root.join("db/migrate/#{filename}")
    require path.to_s
    File.basename(filename, ".rb").sub(/\A\d+_/, "").camelize.constantize
  end
end

RSpec.configure do |config|
  config.include ContinuousAggregateRefresh

  config.before(:suite) do
    Object.new.extend(ContinuousAggregateRefresh).ensure_continuous_aggregates!
  rescue StandardError => e
    warn "[ContinuousAggregateRefresh] suite bootstrap skipped: #{e.class}: #{e.message}"
  end
end

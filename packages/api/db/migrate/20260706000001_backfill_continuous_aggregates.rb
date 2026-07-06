class BackfillContinuousAggregates < ActiveRecord::Migration[8.1]
  CAGGS = %w[timeseries.hourly_token_usage timeseries.daily_token_usage].freeze

  def up
    # Backfill all historical data into the continuous aggregates.
    # The refresh policies added in CreateContinuousAggregates only cover a rolling
    # 3-day window going forward; any data older than that is not automatically
    # materialised. This one-time backfill covers everything from the earliest
    # tool_event up to the policy's end_offset boundary.
    #
    # Skip gracefully if the CAGGs haven't been created yet (e.g. fresh dev DB
    # that hasn't run the TimescaleDB extension or CreateContinuousAggregates).
    existing = cagg_view_names
    return if existing.empty?

    if existing.include?("hourly_token_usage")
      execute <<-SQL
        CALL refresh_continuous_aggregate(
          'timeseries.hourly_token_usage',
          NULL,
          NOW() - INTERVAL '1 hour'
        );
      SQL
    end

    if existing.include?("daily_token_usage")
      execute <<-SQL
        CALL refresh_continuous_aggregate(
          'timeseries.daily_token_usage',
          NULL,
          NOW() - INTERVAL '1 day'
        );
      SQL
    end
  end

  def down
    # Refreshing a CAGG is not reversible — data is re-derived from the hypertable.
    # Rolling back this migration leaves the CAGG in whatever state it was in before.
  end

  private

  def cagg_view_names
    ActiveRecord::Base.connection
      .execute("SELECT view_name FROM timescaledb_information.continuous_aggregates")
      .map { |r| r["view_name"] }
  rescue ActiveRecord::StatementInvalid
    []
  end
end

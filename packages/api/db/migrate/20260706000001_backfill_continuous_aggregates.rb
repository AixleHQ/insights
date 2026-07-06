class BackfillContinuousAggregates < ActiveRecord::Migration[8.1]
  def up
    # Backfill all historical data into the continuous aggregates.
    # The refresh policies added in CreateContinuousAggregates only cover a rolling
    # 3-day window going forward; any data older than that is not automatically
    # materialised. This one-time backfill covers everything from the earliest
    # tool_event up to the policy's end_offset boundary.
    execute <<-SQL
      CALL refresh_continuous_aggregate(
        'timeseries.hourly_token_usage',
        NULL,
        NOW() - INTERVAL '1 hour'
      );
    SQL

    execute <<-SQL
      CALL refresh_continuous_aggregate(
        'timeseries.daily_token_usage',
        NULL,
        NOW() - INTERVAL '1 day'
      );
    SQL
  end

  def down
    # Refreshing a CAGG is not reversible — data is re-derived from the hypertable.
    # Rolling back this migration leaves the CAGG in whatever state it was in before.
  end
end

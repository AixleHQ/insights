# frozen_string_literal: true

# Ensures the TimescaleDB retention policy on timeseries.tool_events matches
# the current MAX_RETENTION_DAYS environment variable.
#
# This job acts as the global ceiling enforcer. It is idempotent: if the
# existing policy already matches the configured interval it logs a no-op and
# exits without touching the database policy.
#
# The application-level DataRetentionPurgeJob handles stricter per-org /
# per-project enforcement on top of this ceiling.
#
# Run cadence: daily at 01:00 (before DataRetentionPurgeJob at 02:00) via
# Sidekiq Cron (see config/initializers/sidekiq_cron.rb).
class UpdateTimescaleRetentionJob
  include Sidekiq::Job

  sidekiq_options queue: "maintenance", retry: 3

  HYPERTABLE = "timeseries.tool_events"
  HYPERTABLE_UNQUALIFIED = "tool_events"

  def perform
    target_days = RetentionService.max_tool_events_retention_days
    current_days = current_retention_days

    if current_days == target_days
      Rails.logger.info(
        "[UpdateTimescaleRetentionJob] No change needed — " \
        "retention policy already set to #{target_days} days for #{HYPERTABLE}"
      )
      return
    end

    Rails.logger.info(
      "[UpdateTimescaleRetentionJob] Updating retention policy on #{HYPERTABLE}: " \
      "#{current_days.inspect} days → #{target_days} days"
    )

    # TimescaleDB policy functions resolve the table name via regclass using search_path.
    # The hypertable lives in the `timeseries` schema which is not in the default
    # search_path, so we set it explicitly for this session before calling the functions.
    ApplicationRecord.connection.transaction do
      ApplicationRecord.connection.execute("SET LOCAL search_path TO timeseries, public;")
      ApplicationRecord.connection.execute(
        "SELECT remove_retention_policy('#{HYPERTABLE_UNQUALIFIED}');"
      )
      ApplicationRecord.connection.execute(
        "SELECT add_retention_policy('#{HYPERTABLE_UNQUALIFIED}', INTERVAL '#{target_days} days');"
      )
    end

    Rails.logger.info(
      "[UpdateTimescaleRetentionJob] Done — retention policy set to #{target_days} days"
    )
  end

  private

  # Returns the current retention interval in days from timescaledb_information,
  # or nil if no retention policy exists for the hypertable.
  #
  # config->'drop_after' is a PostgreSQL interval stored as JSON string, e.g. "730 days".
  # We cast it to an interval and extract epoch to get seconds, then convert to days.
  def current_retention_days
    result = ApplicationRecord.connection.select_one(<<~SQL)
      SELECT
        EXTRACT(EPOCH FROM (config->>'drop_after')::interval)::bigint / 86400 AS days
      FROM timescaledb_information.jobs
      WHERE proc_name = 'policy_retention'
        AND hypertable_schema || '.' || hypertable_name = '#{HYPERTABLE}'
      LIMIT 1
    SQL

    result&.fetch("days")&.to_i
  end
end

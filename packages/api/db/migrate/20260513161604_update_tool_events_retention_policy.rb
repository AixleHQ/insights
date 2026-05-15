# frozen_string_literal: true

class UpdateToolEventsRetentionPolicy < ActiveRecord::Migration[8.1]
  # Replaces the hard-coded 730-day TimescaleDB retention ceiling on tool_events
  # with a value driven by MAX_RETENTION_DAYS (default: 730).
  #
  # The TimescaleDB policy acts as the global ceiling — chunks older than this
  # are dropped entirely. The application-level DataRetentionPurgeJob enforces
  # stricter per-org / per-project windows on top of this ceiling.
  #
  # Decision: Option A — TimescaleDB ceiling + application purge job for per-org enforcement.

  def up
    days = ENV.fetch("MAX_RETENTION_DAYS", RetentionService::DEFAULT_RETENTION_DAYS).to_i

    execute "SET search_path TO timeseries, public;"
    execute "SELECT remove_retention_policy('tool_events', if_exists => true);"
    execute "SELECT add_retention_policy('tool_events', INTERVAL '#{days} days');"
  ensure
    execute "SET search_path TO public;" rescue nil
  end

  def down
    execute "SET search_path TO timeseries, public;"
    execute "SELECT remove_retention_policy('tool_events', if_exists => true);"
    execute "SELECT add_retention_policy('tool_events', INTERVAL '#{RetentionService::DEFAULT_RETENTION_DAYS} days');"
  ensure
    execute "SET search_path TO public;" rescue nil
  end
end

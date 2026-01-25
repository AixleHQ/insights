class EnableTimescaleDbAndCreateEnums < ActiveRecord::Migration[8.1]
  def up
    # Enable TimescaleDB extension
    enable_extension 'timescaledb'

    # Enable pgcrypto for UUID generation
    enable_extension 'pgcrypto'

    # Create timeseries schema for hypertables
    execute "CREATE SCHEMA IF NOT EXISTS timeseries"

    # Create enums for member roles
    execute <<-SQL
      CREATE TYPE member_role AS ENUM ('owner', 'admin', 'member', 'viewer');
    SQL

    # Create enums for connector types
    execute <<-SQL
      CREATE TYPE connector_type AS ENUM (
        'github', 'gitlab', 'bitbucket',
        'jira', 'linear',
        'openrouter', 'anthropic', 'openai', 'gemini'
      );
    SQL

    # Create enums for tool names
    execute <<-SQL
      CREATE TYPE tool_name AS ENUM (
        'claude_code', 'cursor', 'windsurf', 'github_copilot',
        'aider', 'continue', 'cody', 'tabnine', 'amazon_q',
        'openrouter', 'anthropic_api', 'openai_api', 'gemini_api',
        'custom'
      );
    SQL

    # Create enums for event types
    execute <<-SQL
      CREATE TYPE event_type AS ENUM (
        'chat', 'completion', 'edit', 'commit', 'review',
        'test', 'debug', 'refactor', 'documentation', 'other'
      );
    SQL

    # Create enums for risk levels
    execute <<-SQL
      CREATE TYPE risk_level AS ENUM ('low', 'medium', 'high', 'critical');
    SQL

    # Create retention policy enums
    execute <<-SQL
      CREATE TYPE raw_event_ttl AS ENUM (
        '6_hours', '12_hours', '24_hours', '48_hours', '72_hours'
      );
    SQL

    execute <<-SQL
      CREATE TYPE tool_events_retention AS ENUM (
        '30_days', '60_days', '90_days', '180_days', '365_days', '730_days'
      );
    SQL

    execute <<-SQL
      CREATE TYPE hourly_aggregate_retention AS ENUM (
        '90_days', '180_days', '365_days', '730_days'
      );
    SQL

    execute <<-SQL
      CREATE TYPE daily_aggregate_retention AS ENUM (
        '365_days', '730_days', '1095_days', 'forever'
      );
    SQL
  end

  def down
    execute "DROP TYPE IF EXISTS daily_aggregate_retention"
    execute "DROP TYPE IF EXISTS hourly_aggregate_retention"
    execute "DROP TYPE IF EXISTS tool_events_retention"
    execute "DROP TYPE IF EXISTS raw_event_ttl"
    execute "DROP TYPE IF EXISTS risk_level"
    execute "DROP TYPE IF EXISTS event_type"
    execute "DROP TYPE IF EXISTS tool_name"
    execute "DROP TYPE IF EXISTS connector_type"
    execute "DROP TYPE IF EXISTS member_role"
    execute "DROP SCHEMA IF EXISTS timeseries CASCADE"
    disable_extension 'timescaledb'
    disable_extension 'pgcrypto'
  end
end

class ProjectRetentionPolicy < ApplicationRecord
  # Also holds alert threshold columns (cost_threshold_cents, token_threshold, alert_enabled)
  # added by AIX-203. Full alert resolution semantics live in AIX-212.
  RAW_EVENT_TTLS = %w[6_hours 12_hours 24_hours 48_hours 72_hours].freeze
  TOOL_EVENTS_RETENTIONS = %w[30_days 60_days 90_days 180_days 365_days 730_days].freeze
  HOURLY_AGGREGATE_RETENTIONS = %w[90_days 180_days 365_days 730_days].freeze
  DAILY_AGGREGATE_RETENTIONS = %w[365_days 730_days 1095_days forever].freeze

  belongs_to :project
  belongs_to :updated_by, class_name: "User", optional: true

  validates :project_id, uniqueness: true
  validates :raw_event_ttl, inclusion: { in: RAW_EVENT_TTLS }
  validates :tool_events_retention, inclusion: { in: TOOL_EVENTS_RETENTIONS }
  validates :hourly_aggregate_retention, inclusion: { in: HOURLY_AGGREGATE_RETENTIONS }
  validates :daily_aggregate_retention, inclusion: { in: DAILY_AGGREGATE_RETENTIONS }

  def raw_event_ttl_duration
    parse_duration(raw_event_ttl)
  end

  def tool_events_retention_duration
    parse_duration(tool_events_retention)
  end

  def hourly_aggregate_retention_duration
    parse_duration(hourly_aggregate_retention)
  end

  def daily_aggregate_retention_duration
    return nil if daily_aggregate_retention == "forever"
    parse_duration(daily_aggregate_retention)
  end

  private

  def parse_duration(value)
    return nil if value == "forever"
    amount, unit = value.split("_")
    amount.to_i.send(unit)
  end
end

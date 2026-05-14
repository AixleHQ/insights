class RetentionService
  DEFAULTS = {
    raw_event_ttl: "24_hours",
    tool_events_retention: "90_days",
    hourly_aggregate_retention: "365_days",
    daily_aggregate_retention: "forever"
  }.freeze

  RETENTION_LABELS = {
    "6_hours" => "6 hours",
    "12_hours" => "12 hours",
    "24_hours" => "24 hours",
    "48_hours" => "48 hours",
    "72_hours" => "72 hours",
    "30_days" => "30 days",
    "60_days" => "60 days",
    "90_days" => "90 days",
    "180_days" => "6 months",
    "365_days" => "1 year (SOC2)",
    "730_days" => "2 years (HIPAA)",
    "1095_days" => "3 years",
    "forever" => "Forever"
  }.freeze

  class << self
    def for_organization(org)
      policy = org.retention_policy

      {
        raw_event_ttl: policy&.raw_event_ttl || DEFAULTS[:raw_event_ttl],
        tool_events_retention: policy&.tool_events_retention || DEFAULTS[:tool_events_retention],
        hourly_aggregate_retention: policy&.hourly_aggregate_retention || DEFAULTS[:hourly_aggregate_retention],
        daily_aggregate_retention: policy&.daily_aggregate_retention || DEFAULTS[:daily_aggregate_retention]
      }
    end

    def retention_cutoff(org, retention_type)
      policy = for_organization(org)
      enum_value = policy[retention_type]
      return nil if enum_value == "forever"

      duration = parse_duration(enum_value)
      duration.ago
    end

    def retention_options(retention_type)
      values = case retention_type
      when :raw_event_ttl
        OrganizationRetentionPolicy::RAW_EVENT_TTLS
      when :tool_events_retention
        OrganizationRetentionPolicy::TOOL_EVENTS_RETENTIONS
      when :hourly_aggregate_retention
        OrganizationRetentionPolicy::HOURLY_AGGREGATE_RETENTIONS
      when :daily_aggregate_retention
        OrganizationRetentionPolicy::DAILY_AGGREGATE_RETENTIONS
      else
        raise ArgumentError, "Unknown retention type: #{retention_type}"
      end

      values.map do |value|
        {
          value: value,
          label: RETENTION_LABELS[value] || value.humanize,
          default: value == DEFAULTS[retention_type]
        }
      end
    end

    def all_options
      {
        raw_event_ttl: retention_options(:raw_event_ttl),
        tool_events_retention: retention_options(:tool_events_retention),
        hourly_aggregate_retention: retention_options(:hourly_aggregate_retention),
        daily_aggregate_retention: retention_options(:daily_aggregate_retention)
      }
    end

    # Returns the global TimescaleDB ceiling in days from the MAX_RETENTION_DAYS
    # environment variable. This ceiling must be >= any per-org tool_events_retention
    # window; the DataRetentionPurgeJob enforces stricter per-org limits on top.
    def max_tool_events_retention_days
      ENV.fetch("MAX_RETENTION_DAYS", "365").to_i
    end

    private

    def parse_duration(value)
      return nil if value == "forever"
      amount, unit = value.split("_")
      amount.to_i.send(unit)
    end
  end
end

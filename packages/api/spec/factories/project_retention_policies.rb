FactoryBot.define do
  factory :project_retention_policy do
    project
    raw_event_ttl { "24_hours" }
    tool_events_retention { "90_days" }
    hourly_aggregate_retention { "365_days" }
    daily_aggregate_retention { "forever" }
    retention_reason { nil }
    updated_by { nil }
  end
end

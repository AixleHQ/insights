FactoryBot.define do
  factory :project_retention_policy do
    association :project
    raw_event_ttl { "24_hours" }
    tool_events_retention { "90_days" }
    hourly_aggregate_retention { "365_days" }
    daily_aggregate_retention { "forever" }
    retention_reason { nil }
    updated_by { nil }

    to_create do |instance|
      # Projects always auto-create a default retention policy via after_create callback.
      # Update the existing record instead of attempting a duplicate insert.
      existing = instance.project.reload.retention_policy
      if existing
        existing.update!(
          raw_event_ttl: instance.raw_event_ttl,
          tool_events_retention: instance.tool_events_retention,
          hourly_aggregate_retention: instance.hourly_aggregate_retention,
          daily_aggregate_retention: instance.daily_aggregate_retention,
          retention_reason: instance.retention_reason,
          updated_by: instance.updated_by
        )
        instance.id = existing.id
        instance.created_at = existing.created_at
        instance.updated_at = existing.updated_at
        instance.clear_changes_information
      else
        instance.save!
      end
    end
  end
end

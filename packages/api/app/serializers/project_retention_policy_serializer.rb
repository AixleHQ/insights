# frozen_string_literal: true

class ProjectRetentionPolicySerializer < BaseSerializer
  attributes :id, :raw_event_ttl, :tool_events_retention, :hourly_aggregate_retention,
             :daily_aggregate_retention, :retention_reason, :updated_by_id
  timestamps

  attribute :project_id do |policy|
    policy.project_id
  end
end

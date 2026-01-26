# frozen_string_literal: true

class OrganizationRetentionPolicySerializer < BaseSerializer
  attributes :id, :raw_event_ttl, :tool_events_retention, :hourly_aggregate_retention,
             :daily_aggregate_retention, :retention_reason, :updated_by_id
  timestamps

  attribute :organization_id do |policy|
    policy.organization_id
  end
end

# frozen_string_literal: true

require 'administrate/base_dashboard'

class OrganizationRetentionPolicyDashboard < Administrate::BaseDashboard
  ATTRIBUTE_TYPES = {
    id: Field::String,
    organization: Field::BelongsTo,
    updated_by: Field::BelongsTo.with_options(class_name: 'User'),
    raw_event_ttl: Field::String,
    tool_events_retention: Field::String,
    hourly_aggregate_retention: Field::String,
    daily_aggregate_retention: Field::String,
    retention_reason: Field::String,
    created_at: Field::DateTime,
    updated_at: Field::DateTime
  }.freeze

  COLLECTION_ATTRIBUTES = %i[
    id
    organization
    raw_event_ttl
    tool_events_retention
  ].freeze

  SHOW_PAGE_ATTRIBUTES = %i[
    id
    organization
    raw_event_ttl
    tool_events_retention
    hourly_aggregate_retention
    daily_aggregate_retention
    retention_reason
    updated_by
    created_at
    updated_at
  ].freeze

  FORM_ATTRIBUTES = %i[
    organization
    raw_event_ttl
    tool_events_retention
    hourly_aggregate_retention
    daily_aggregate_retention
    retention_reason
  ].freeze

  def display_resource(policy)
    "#{policy.organization&.name} - #{policy.raw_event_ttl}"
  end
end

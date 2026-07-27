# frozen_string_literal: true

require "administrate/base_dashboard"

class AuditLogDashboard < Administrate::BaseDashboard
  ATTRIBUTE_TYPES = {
    id: Field::String,
    organization: Field::BelongsTo,
    tool_event: Field::BelongsTo,
    policy_version: Field::BelongsTo,
    user_display: Field::String.with_options(searchable: false),
    raw_event_key: Field::String,
    risk_level: Field::String,
    classification_labels: Field::String,
    confidence_score: Field::Number.with_options(decimals: 4),
    sanitization_actions: Field::String,
    temporal_workflow_id: Field::String,
    metadata: Field::Text,
    created_at: Field::DateTime
  }.freeze

  COLLECTION_ATTRIBUTES = %i[
    id
    organization
    risk_level
    confidence_score
    created_at
  ].freeze

  SHOW_PAGE_ATTRIBUTES = %i[
    id
    organization
    tool_event
    policy_version
    user_display
    raw_event_key
    risk_level
    classification_labels
    confidence_score
    sanitization_actions
    temporal_workflow_id
    metadata
    created_at
  ].freeze

  # Audit logs are read-only
  FORM_ATTRIBUTES = [].freeze

  COLLECTION_FILTERS = {}.freeze

  def display_resource(log)
    "#{log.risk_level} #{log.raw_event_key} - #{log.created_at&.strftime('%Y-%m-%d %H:%M')}"
  end
end

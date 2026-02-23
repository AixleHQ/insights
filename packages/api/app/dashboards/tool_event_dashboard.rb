# frozen_string_literal: true

require 'administrate/base_dashboard'

class ToolEventDashboard < Administrate::BaseDashboard
  ATTRIBUTE_TYPES = {
    id: Field::String,
    user: Field::BelongsTo,
    organization: Field::BelongsTo,
    project: Field::BelongsTo,
    repository: Field::BelongsTo,
    event_type: Field::String,
    tool_name: Field::String,
    tokens_in: Field::Number,
    tokens_out: Field::Number,
    tokens_total: Field::Number,
    model: Field::String,
    duration_ms: Field::Number,
    cost_usd: Field::Number,
    metadata: Field::Text,
    occurred_at: Field::DateTime,
    created_at: Field::DateTime
  }.freeze

  COLLECTION_ATTRIBUTES = %i[
    id
    user
    organization
    event_type
    tool_name
    tokens_total
    occurred_at
  ].freeze

  SHOW_PAGE_ATTRIBUTES = %i[
    id
    user
    organization
    project
    repository
    event_type
    tool_name
    tokens_in
    tokens_out
    tokens_total
    model
    duration_ms
    cost_usd
    metadata
    occurred_at
    created_at
  ].freeze

  # Tool events are read-only
  FORM_ATTRIBUTES = [].freeze

  COLLECTION_FILTERS = {}.freeze

  def display_resource(event)
    "#{event.event_type} - #{event.occurred_at&.strftime('%Y-%m-%d %H:%M')}"
  end
end

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
    session_id: Field::String,
    input_tokens: Field::Number,
    output_tokens: Field::Number,
    total_tokens: Field::Number,
    model_name: Field::String,
    duration_ms: Field::Number,
    metadata: Field::Text,
    created_at: Field::DateTime
  }.freeze

  COLLECTION_ATTRIBUTES = %i[
    id
    user
    organization
    event_type
    tool_name
    total_tokens
    created_at
  ].freeze

  SHOW_PAGE_ATTRIBUTES = %i[
    id
    user
    organization
    project
    repository
    event_type
    tool_name
    session_id
    input_tokens
    output_tokens
    total_tokens
    model_name
    duration_ms
    metadata
    created_at
  ].freeze

  # Tool events are read-only
  FORM_ATTRIBUTES = [].freeze

  COLLECTION_FILTERS = {}.freeze

  def display_resource(event)
    "#{event.event_type} - #{event.created_at&.strftime('%Y-%m-%d %H:%M')}"
  end
end

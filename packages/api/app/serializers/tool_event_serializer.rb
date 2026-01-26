# frozen_string_literal: true

class ToolEventSerializer < BaseSerializer
  attributes :id, :organization_id, :user_id, :project_id,
             :tool_name, :event_type, :model,
             :tokens_in, :tokens_out, :tokens_total,
             :cost_usd, :duration_ms

  datetime_attribute :occurred_at
  datetime_attribute :created_at

  # Provide cost_cents as a computed field for backward compatibility
  attribute :cost_cents do |event|
    event.cost_usd ? (event.cost_usd * 100).round : nil
  end
end

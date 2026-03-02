# frozen_string_literal: true

class ToolEventSerializer < BaseSerializer
  attributes :id, :organization_id, :user_id, :project_id,
             :tool_name, :event_type, :model,
             :cost_usd, :duration_ms

  datetime_attribute :occurred_at
  datetime_attribute :created_at

  # Map tokens_in/tokens_out to input_tokens/output_tokens for frontend compatibility
  attribute :input_tokens do |event|
    event.tokens_in
  end

  attribute :output_tokens do |event|
    event.tokens_out
  end

  # Computed risk level based on cost and tool behavior
  attribute :risk_level do |event|
    # Simple heuristic: high cost = higher risk
    cost = event.cost_usd.to_f
    if cost > 1.0
      "high"
    elsif cost > 0.1
      "medium"
    elsif cost > 0.01
      "low"
    else
      "none"
    end
  end

  # Include user association
  attribute :user do |event|
    if event.user
      {
        id: event.user.id,
        email: event.user.email,
        name: event.user.name
      }
    end
  end

  # Include project association
  attribute :project do |event|
    if event.project
      {
        id: event.project.id,
        name: event.project.name
      }
    end
  end

  # Placeholder for security findings (would come from content analysis)
  attribute :security_findings do |_event|
    []
  end

  # Provide cost_cents as a computed field for backward compatibility
  attribute :cost_cents do |event|
    event.cost_usd ? (event.cost_usd * 100).round : nil
  end
end

# frozen_string_literal: true

class ToolEventSerializer < BaseSerializer
  include ToolEventAttributes

  attributes :id, :organization_id, :user_id, :project_id,
             :tool_name, :event_type, :model,
             :cost_usd, :duration_ms

  datetime_attribute :occurred_at
  datetime_attribute :created_at

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

  # Include project association, falling back to workspace_name from metadata
  # (Anthropic API events store the workspace name but have no DB project)
  attribute :project do |event|
    if event.project
      {
        id: event.project.id,
        name: event.project.name
      }
    elsif event.metadata&.dig("workspace_name").present?
      { name: event.metadata["workspace_name"] }
    end
  end
end

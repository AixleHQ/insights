# frozen_string_literal: true

class ToolEventDetailSerializer < BaseSerializer
  include ToolEventAttributes

  attributes :id, :organization_id, :user_id, :project_id,
             :tool_name, :event_type, :model,
             :cost_usd, :duration_ms, :metadata

  datetime_attribute :occurred_at
  datetime_attribute :created_at

  attribute :user do |event|
    if event.user
      {
        id: event.user.id,
        name: event.user.name,
        email: event.user.email
      }
    end
  end

  attribute :project do |event|
    if event.project
      {
        id: event.project.id,
        name: event.project.name,
        slug: event.project.slug
      }
    elsif event.metadata&.dig("workspace_name").present?
      { name: event.metadata["workspace_name"] }
    end
  end

  attribute :audit_log do |event|
    if event.audit_log
      AuditLogSerializer.new(event.audit_log).serialize
    end
  end
end

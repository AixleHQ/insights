# frozen_string_literal: true

class ToolEventDetailSerializer < BaseSerializer
  attributes :id, :organization_id, :user_id, :project_id,
             :tool_name, :event_type, :model,
             :tokens_in, :tokens_out, :tokens_total,
             :cost_usd, :duration_ms, :metadata

  datetime_attribute :occurred_at
  datetime_attribute :created_at

  attribute :cost_cents do |event|
    event.cost_usd ? (event.cost_usd * 100).round : nil
  end

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
    end
  end

  attribute :audit_log do |event|
    if event.audit_log
      AuditLogSerializer.new(event.audit_log).serialize
    end
  end
end

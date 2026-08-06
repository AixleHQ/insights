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
        email: event.user.email,
        avatarUrl: event.user.avatar_url
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

  # NOTE: fires one subquery per event. Only use this serializer in single-record
  # context (show, audit_trail). If you ever add it to a list endpoint, preload
  # with events.includes(:audit_logs) to avoid N+1.
  attribute :audit_log do |event|
    latest = event.audit_logs.order(created_at: :desc).first
    AuditLogSerializer.new(latest).serialize if latest
  end

  # Owner-only captured prompt/assistant text. The controller computes the gate via
  # EventTextPolicy and passes params[:show_event_text]; non-owners never receive the
  # field. nil when no event_texts row exists (capture off / not yet captured).
  # Ships camelCased as eventText: { userText, assistantText, sanitizedAt }.
  attribute :event_text, if: proc { params[:show_event_text] } do |event|
    text = event.event_text
    next nil unless text

    # transform_keys :lower_camel does not recurse into hashes returned from a block,
    # so emit camelCase keys directly (mirrors the user/project attribute blocks).
    {
      userText: text.user_text,
      assistantText: text.assistant_text,
      sanitizedAt: text.sanitized_at&.iso8601
    }
  end
end

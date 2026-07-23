# frozen_string_literal: true

class EventsChannel < ApplicationCable::Channel
  def subscribed
    organization = find_organization

    unless organization
      reject
      return
    end

    unless authorized?(organization)
      reject
      return
    end

    stream_from "events:#{organization.id}"

    transmit(
      type: "subscription_confirmed",
      organization_id: organization.id,
      subscribed_at: Time.current.iso8601
    )
  end

  def unsubscribed
    # Cleanup when unsubscribed
  end

  # Client can request recent events
  def request_recent(data)
    organization = find_organization

    return unless organization && authorized?(organization)

    limit = [ data["limit"]&.to_i || 10, 50 ].min
    events = organization.tool_events
                         .order(occurred_at: :desc)
                         .limit(limit)
                         .map { |e| serialize_event(e) }

    transmit(
      type: "recent_events",
      events: events,
      count: events.length
    )
  end

  class << self
    # Broadcast a new event to organization subscribers.
    # Payload is intentionally minimal — consumers should use this as a cache-invalidation
    # signal and refetch via the REST API rather than rendering the payload directly.
    # Add fields here only when a client needs them without a round-trip.
    def broadcast_new_event(organization_id, tool_event)
      ActionCable.server.broadcast(
        "events:#{organization_id}",
        {
          type: "new_event",
          event: {
            id: tool_event.id,
            tool_name: tool_event.tool_name,
            event_type: tool_event.event_type,
            user_id: tool_event.user_id,
            tokens_in: tool_event.tokens_in,
            tokens_out: tool_event.tokens_out,
            cost_usd: tool_event.cost_usd,
            occurred_at: tool_event.occurred_at&.iso8601
          },
          timestamp: Time.current.iso8601
        }
      )
    end

    # Broadcast an alert to organization subscribers
    def broadcast_alert(organization_id, alert_data)
      ActionCable.server.broadcast(
        "events:#{organization_id}",
        {
          type: "alert",
          alert: alert_data,
          timestamp: Time.current.iso8601
        }
      )
    end

    # Broadcast event update (e.g., after sanitization)
    def broadcast_event_update(organization_id, tool_event_id, updates)
      ActionCable.server.broadcast(
        "events:#{organization_id}",
        {
          type: "event_updated",
          event_id: tool_event_id,
          updates: updates,
          timestamp: Time.current.iso8601
        }
      )
    end
  end

  private

  def find_organization
    org_id = params[:organization_id]
    return nil unless org_id

    Organization.find_by(id: org_id)
  end

  def authorized?(organization)
    return false unless current_user
    return false unless organization.is_active?

    current_user.member_of?(organization) || current_user.global_admin?
  end

  def serialize_event(event)
    {
      id: event.id,
      tool_name: event.tool_name,
      event_type: event.event_type,
      user_id: event.user_id,
      model: event.model,
      tokens_in: event.tokens_in,
      tokens_out: event.tokens_out,
      cost_usd: event.cost_usd,
      duration_ms: event.duration_ms,
      occurred_at: event.occurred_at&.iso8601
    }
  end
end

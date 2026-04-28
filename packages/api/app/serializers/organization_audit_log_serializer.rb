# frozen_string_literal: true

class OrganizationAuditLogSerializer < BaseSerializer
  attributes :id, :action, :resource_type, :resource_id, :tracked_changes, :metadata, :ip_address

  datetime_attribute :created_at

  attribute :actor do |log|
    next nil unless log.actor

    {
      id: log.actor.id,
      email: log.actor.email,
      name: log.actor.name
    }
  end
end

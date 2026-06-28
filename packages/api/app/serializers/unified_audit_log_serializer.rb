# frozen_string_literal: true

class UnifiedAuditLogSerializer < BaseSerializer
  attributes :id, :action, :resource_type, :resource_id, :tracked_changes,
             :metadata, :ip_address, :user_agent, :severity, :outcome

  datetime_attribute :created_at

  attribute :scope do |log|
    case log
    when OrganizationAuditLog then "organization"
    when ProjectAuditLog      then "project"
    when AdminAuditLog        then "admin"
    end
  end

  attribute :actor do |log|
    actor = log.respond_to?(:actor) ? log.actor : log.try(:admin_user)
    next nil unless actor

    {
      id: actor.id,
      email: actor.email,
      name: actor.name
    }
  end
end

# frozen_string_literal: true

class ProjectAuditLogSerializer < BaseSerializer
  attributes :id, :action, :resource_type, :resource_id, :metadata, :severity, :outcome

  # Omitted for project-admin callers (non-org-admin); present for org admins and global admins.
  # Uses Alba's `attributes` (plural) with an `if:` proc so the keys are fully absent when restricted.
  # The proc receives (record) and runs in the context of the serializer instance, so `params` is accessible.
  attributes :ip_address, :tracked_changes, :user_agent, if: proc { |_log| params[:full_access] }

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

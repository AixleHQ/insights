# frozen_string_literal: true

class OrganizationAuditLog < ApplicationRecord
  ACTIONS = %w[
    project.create
    project.delete
    settings.create
    settings.update
    settings.delete
    retention.update
    alert.update
    connector.create
    connector.update
    connector.delete
    connector.test
    connector.sync
    notification_route.create
    notification_route.update
    notification_route.delete
    tool_account.create
    tool_account.update
    tool_account.delete
    tool_account.regenerate
    member.invited
    member.role_changed
    member.removed
    impersonation.started
    impersonation.ended
  ].freeze

  belongs_to :organization
  belongs_to :actor, class_name: "User", optional: true

  validates :action, presence: true, inclusion: { in: ACTIONS }

  scope :by_actor, ->(actor_id) { where(actor_id: actor_id) }
  scope :by_action, ->(action) { where(action: action) }
  scope :by_resource_type, ->(type) { where(resource_type: type) }
  scope :from_date, ->(date) { where("created_at >= ?", date) }
  scope :to_date, ->(date) { where("created_at <= ?", date) }

  def self.log(organization:, actor:, action:, resource: nil, tracked_changes: {}, metadata: {},
               request: nil, severity: "info", outcome: "success")
    create!(
      organization:    organization,
      actor:           actor,
      action:          action,
      resource_type:   resource&.class&.name,
      resource_id:     resource&.id,
      tracked_changes: tracked_changes,
      metadata:        metadata,
      ip_address:      request&.remote_ip,
      user_agent:      request&.user_agent,
      severity:        severity,
      outcome:         outcome
    )
  rescue StandardError => e
    Rails.logger.error("[OrganizationAuditLog] Failed to log action '#{action}': #{e.message}")
    nil
  end
end

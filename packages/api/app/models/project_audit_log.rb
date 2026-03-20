# frozen_string_literal: true

class ProjectAuditLog < ApplicationRecord
  ACTIONS = %w[
    settings.create
    settings.update
    settings.delete
    connector.create
    connector.update
    connector.delete
    connector.test
    connector.sync
    member.invited
    member.role_changed
    member.removed
  ].freeze

  belongs_to :project
  belongs_to :actor, class_name: "User", optional: true

  validates :action, presence: true, inclusion: { in: ACTIONS }

  scope :by_actor, ->(actor_id) { where(actor_id: actor_id) }
  scope :by_action, ->(action) { where(action: action) }
  scope :by_resource_type, ->(type) { where(resource_type: type) }
  scope :from_date, ->(date) { where("created_at >= ?", date) }
  scope :to_date, ->(date) { where("created_at <= ?", date) }

  def self.log(project:, actor:, action:, resource: nil, tracked_changes: {}, metadata: {}, request: nil)
    create!(
      project: project,
      actor: actor,
      action: action,
      resource_type: resource&.class&.name,
      resource_id: resource&.id,
      tracked_changes: tracked_changes,
      metadata: metadata,
      ip_address: request&.remote_ip
    )
  rescue StandardError => e
    Rails.logger.error("[ProjectAuditLog] Failed to log action '#{action}': #{e.message}")
    nil
  end
end

class AdminAuditLog < ApplicationRecord
  belongs_to :admin_user, class_name: "User"

  validates :action, presence: true
  validates :resource_type, presence: true

  scope :by_admin, ->(user) { where(admin_user: user) }
  scope :by_resource, ->(type, id = nil) { id ? where(resource_type: type, resource_id: id) : where(resource_type: type) }
  scope :recent, -> { order(created_at: :desc) }

  def self.log_action(admin_user:, action:, resource:, tracked_changes: {}, metadata: {},
                      request: nil, severity: "info", outcome: "success")
    create!(
      admin_user:      admin_user,
      action:          action,
      resource_type:   resource.class.name,
      resource_id:     resource.id,
      tracked_changes: tracked_changes,
      metadata:        metadata,
      ip_address:      request&.remote_ip,
      user_agent:      request&.user_agent,
      severity:        severity,
      outcome:         outcome
    )
  rescue StandardError => e
    Rails.logger.error("[AdminAuditLog] Failed to log action '#{action}': #{e.message}")
    nil
  end
end

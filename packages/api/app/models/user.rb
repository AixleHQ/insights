class User < ApplicationRecord
  has_many :organization_memberships, dependent: :destroy
  has_many :organizations, through: :organization_memberships
  has_many :project_memberships, dependent: :destroy
  has_many :sent_invitations, class_name: "Invitation", foreign_key: :invited_by_id, dependent: :destroy
  has_many :projects, through: :project_memberships
  has_many :owned_projects, class_name: "Project", foreign_key: :owner_id, dependent: :nullify
  has_many :user_settings, dependent: :destroy
  # singular name follows has_one convention; class_name avoids plural-table inference
  has_one :personal_setting, class_name: "UserPersonalSettings", dependent: :destroy
  has_many :tool_events, class_name: "ToolEvent", dependent: :restrict_with_error
  has_many :admin_audit_logs, foreign_key: :admin_user_id, dependent: :restrict_with_error
  has_many :actor_organization_audit_logs, class_name: "OrganizationAuditLog", foreign_key: :actor_id, dependent: :nullify
  has_many :actor_project_audit_logs, class_name: "ProjectAuditLog", foreign_key: :actor_id, dependent: :nullify
  has_many :assigned_issues, class_name: "Issue", foreign_key: :assignee_id, dependent: :nullify
  has_many :notification_routes_as_recipient, class_name: "NotificationRoute", foreign_key: :recipient_user_id, dependent: :nullify
  has_many :updated_organization_retention_policies, class_name: "OrganizationRetentionPolicy", foreign_key: :updated_by_id, dependent: :nullify
  has_many :updated_project_retention_policies, class_name: "ProjectRetentionPolicy", foreign_key: :updated_by_id, dependent: :nullify
  has_many :created_scheduled_exports, class_name: "ScheduledExport", foreign_key: :created_by_id, dependent: :restrict_with_error
  has_many :notifications, dependent: :destroy
  has_many :user_project_favorites, dependent: :destroy
  has_many :favorited_projects, through: :user_project_favorites, source: :project
  has_one_attached :avatar_file

  validates :keycloak_sub, presence: true, uniqueness: true
  validates :email, presence: true, uniqueness: true, format: { with: URI::MailTo::EMAIL_REGEXP }
  validates :global_admin, inclusion: { in: [ true, false ] }

  scope :global_admins, -> { where(global_admin: true) }
  scope :active_in_organization, ->(org) { joins(:organization_memberships).where(organization_memberships: { organization_id: org.id }) }

  def display_name
    name.presence || email.split("@").first
  end

  def member_of?(organization)
    organization_memberships.exists?(organization: organization)
  end

  def role_in(organization)
    organization_memberships.find_by(organization: organization)&.role
  end

  def admin_of?(organization)
    # post-AIX-201: admin org role removed; admin_of? now means owner-only
    membership = organization_memberships.find_by(organization: organization)
    membership&.role == "owner"
  end

  def global_admin?
    global_admin == true
  end

  def resolved_avatar_url
    return avatar_url unless avatar_file.attached?

    avatar_file.url
  end
end

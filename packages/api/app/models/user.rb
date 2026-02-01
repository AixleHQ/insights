class User < ApplicationRecord
  has_many :organization_memberships, dependent: :destroy
  has_many :organizations, through: :organization_memberships
  has_many :project_memberships, dependent: :destroy
  has_many :sent_invitations, class_name: 'Invitation', foreign_key: :invited_by_id, dependent: :destroy
  has_many :projects, through: :project_memberships
  has_many :owned_projects, class_name: 'Project', foreign_key: :owner_id, dependent: :nullify
  has_many :user_settings, dependent: :destroy
  has_many :tool_events, class_name: 'ToolEvent', dependent: :restrict_with_error
  has_many :admin_audit_logs, foreign_key: :admin_user_id, dependent: :restrict_with_error

  validates :keycloak_sub, presence: true, uniqueness: true
  validates :email, presence: true, uniqueness: true, format: { with: URI::MailTo::EMAIL_REGEXP }
  validates :global_admin, inclusion: { in: [true, false] }

  scope :global_admins, -> { where(global_admin: true) }
  scope :active_in_organization, ->(org) { joins(:organization_memberships).where(organization_memberships: { organization_id: org.id }) }

  def display_name
    name.presence || email.split('@').first
  end

  def member_of?(organization)
    organization_memberships.exists?(organization: organization)
  end

  def role_in(organization)
    organization_memberships.find_by(organization: organization)&.role
  end

  def admin_of?(organization)
    membership = organization_memberships.find_by(organization: organization)
    membership&.role.in?(%w[owner admin])
  end

  def global_admin?
    global_admin == true
  end
end

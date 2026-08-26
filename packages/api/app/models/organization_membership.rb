class OrganizationMembership < ApplicationRecord
  # post-AIX-201: admin removed as org role; admin is platform-only (User#global_admin)
  ROLES = %w[owner member viewer].freeze

  belongs_to :user
  belongs_to :organization
  has_many :user_tool_accounts, dependent: :destroy

  validates :role, presence: true, inclusion: { in: ROLES }
  validates :user_id, uniqueness: { scope: :organization_id, message: "is already a member of this organization" }
  validate :cannot_downgrade_last_owner, on: :update, if: :role_changed?

  before_destroy :ensure_not_last_owner
  # Org membership has no DB cascade onto project memberships, so removal paths that
  # bypass OrganizationMembershipRemovalService (Administrate admin panel, console)
  # would otherwise leave orphaned project_memberships granting stale access (AIX-611).
  after_destroy :remove_org_project_memberships

  scope :owners, -> { where(role: "owner") }
  scope :admins, -> { where(role: "owner") } # post-AIX-201: admin removed; admins scope == owners
  scope :members, -> { where(role: "member") }
  scope :viewers, -> { where(role: "viewer") }

  def owner?
    role == "owner"
  end

  def admin?
    owner? # post-AIX-201: admin org role removed; semantically equivalent to owner
  end

  def can_manage_projects?
    role.in?(%w[owner member])
  end

  private

  # delete_all bypasses ProjectMembership#ensure_not_last_owner intentionally: guaranteed
  # removal is the goal, and org owners retain implicit project ownership via
  # ProjectPolicy#project_owner?, so an org project is never truly left orphaned.
  def remove_org_project_memberships
    ProjectMembership
      .where(user_id: user_id, project_id: organization.projects.select(:id))
      .delete_all
  end

  def ensure_not_last_owner
    return if organization.being_destroyed

    if owner? && organization.organization_memberships.owners.count == 1
      errors.add(:base, "Cannot remove the last owner of an organization")
      throw :abort
    end
  end

  def cannot_downgrade_last_owner
    if role_was == "owner" && organization.organization_memberships.owners.count == 1
      errors.add(:role, "Cannot downgrade the last owner of an organization")
    end
  end
end

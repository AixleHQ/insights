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

  def can_manage_members?
    owner?
  end

  def can_manage_projects?
    role.in?(%w[owner member])
  end

  private

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

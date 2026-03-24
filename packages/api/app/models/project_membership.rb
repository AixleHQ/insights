class ProjectMembership < ApplicationRecord
  ROLES = %w[owner admin member viewer].freeze

  belongs_to :user
  belongs_to :project

  validates :role, presence: true, inclusion: { in: ROLES }
  validates :user_id, uniqueness: { scope: :project_id, message: "is already a member of this project" }
  validate :cannot_downgrade_last_owner, on: :update, if: :role_changed?

  before_destroy :ensure_not_last_owner

  scope :owners, -> { where(role: "owner") }
  scope :admins, -> { where(role: %w[owner admin]) }

  def owner?
    role == "owner"
  end

  def admin?
    role.in?(%w[owner admin])
  end

  def can_edit?
    role.in?(%w[owner admin member])
  end

  private

  def ensure_not_last_owner
    return if project.being_destroyed

    if owner? && project.project_memberships.owners.count == 1
      errors.add(:base, "Cannot remove the last owner of a project")
      throw :abort
    end
  end

  def cannot_downgrade_last_owner
    if role_was == "owner" && project.project_memberships.owners.count == 1
      errors.add(:role, "Cannot downgrade the last owner of a project")
    end
  end
end

# frozen_string_literal: true

class ProjectMembership < ApplicationRecord
  # post-AIX-202: admin removed as project role; only org owners can manage memberships
  ROLES = %w[owner member viewer].freeze

  belongs_to :user
  belongs_to :project
  belongs_to :created_by, class_name: "User", optional: true

  validates :role, presence: true, inclusion: { in: ROLES }
  validates :user_id, uniqueness: { scope: :project_id, message: "is already a member of this project" }
  validate :cannot_downgrade_last_owner, on: :update, if: :role_changed?
  validate :user_must_be_org_member, if: -> { project&.organization_project? }

  before_destroy :ensure_not_last_owner

  scope :owners, -> { where(role: "owner") }
  scope :admins, -> { where(role: "owner") } # post-AIX-202: admin removed; admins scope == owners

  def owner?
    role == "owner"
  end

  def admin?
    owner? # post-AIX-202: admin project role removed; semantically equivalent to owner
  end

  def can_edit?
    role.in?(%w[owner member])
  end

  private

  def user_must_be_org_member
    return unless user && project&.organization

    return if user.member_of?(project.organization)

    errors.add(:user_id, "must be a member of the project's organization")
  end

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

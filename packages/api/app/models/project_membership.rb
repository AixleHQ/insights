class ProjectMembership < ApplicationRecord
  ROLES = %w[owner admin member viewer].freeze

  belongs_to :user
  belongs_to :project

  validates :role, presence: true, inclusion: { in: ROLES }
  validates :user_id, uniqueness: { scope: :project_id, message: 'is already a member of this project' }

  scope :owners, -> { where(role: 'owner') }
  scope :admins, -> { where(role: %w[owner admin]) }

  def owner?
    role == 'owner'
  end

  def admin?
    role.in?(%w[owner admin])
  end

  def can_edit?
    role.in?(%w[owner admin member])
  end
end

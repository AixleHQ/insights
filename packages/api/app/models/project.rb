class Project < ApplicationRecord
  belongs_to :organization, optional: true
  belongs_to :owner, class_name: 'User', optional: true
  has_many :project_memberships, dependent: :destroy
  has_many :members, through: :project_memberships, source: :user
  has_many :project_settings, dependent: :destroy
  has_many :repositories, dependent: :destroy
  has_many :tool_events, class_name: 'ToolEvent', dependent: :restrict_with_error

  validates :name, presence: true
  validates :slug, presence: true, format: { with: /\A[a-z0-9]+(?:-[a-z0-9]+)*\z/, message: 'must be lowercase alphanumeric with hyphens' }
  validates :is_active, inclusion: { in: [true, false] }
  validate :must_belong_to_org_or_owner

  before_validation :generate_slug, on: :create

  scope :active, -> { where(is_active: true) }
  scope :organization_projects, -> { where.not(organization_id: nil) }
  scope :personal_projects, -> { where.not(owner_id: nil) }

  def personal?
    owner_id.present?
  end

  def organization_project?
    organization_id.present?
  end

  private

  def generate_slug
    return if slug.present?
    self.slug = name.to_s.parameterize
  end

  def must_belong_to_org_or_owner
    if organization_id.blank? && owner_id.blank?
      errors.add(:base, 'Project must belong to an organization or have an owner')
    elsif organization_id.present? && owner_id.present?
      errors.add(:base, 'Project cannot belong to both an organization and have a personal owner')
    end
  end
end

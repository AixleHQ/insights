class Project < ApplicationRecord
  belongs_to :organization, optional: true
  belongs_to :owner, class_name: "User", optional: true
  has_many :project_memberships, dependent: :destroy
  has_many :members, through: :project_memberships, source: :user
  has_many :project_settings, dependent: :destroy
  has_many :project_connectors, dependent: :destroy
  has_many :repositories, dependent: :destroy
  has_many :project_audit_logs, dependent: :destroy
  has_many :tool_events, class_name: "ToolEvent", dependent: :restrict_with_error
  has_many :issues, dependent: :destroy
  has_one :retention_policy, class_name: "ProjectRetentionPolicy", dependent: :destroy

  validates :name, presence: true
  validates :slug, presence: true, format: { with: /\A[a-z0-9]+(?:-[a-z0-9]+)*\z/, message: "must be lowercase alphanumeric with hyphens" }
  validates :is_active, inclusion: { in: [ true, false ] }
  validate :must_belong_to_org_or_owner

  after_create :create_default_retention_policy

  before_destroy :flag_as_being_destroyed, prepend: true
  before_validation :generate_slug, on: :create
  before_save :normalize_git_remote_url_field

  attr_reader :being_destroyed

  scope :active, -> { where(is_active: true) }
  scope :organization_projects, -> { where.not(organization_id: nil) }
  scope :personal_projects, -> { where.not(owner_id: nil) }

  def personal?
    owner_id.present?
  end

  def organization_project?
    organization_id.present?
  end

  def self.normalize_git_remote(url)
    return nil if url.blank?
    url.strip.downcase.delete_suffix(".git")
  end

  private

  def normalize_git_remote_url_field
    self.git_remote_url = self.class.normalize_git_remote(git_remote_url)
  end

  def create_default_retention_policy
    create_retention_policy!
  end

  def flag_as_being_destroyed
    @being_destroyed = true
  end

  def generate_slug
    return if slug.present?
    self.slug = name.to_s.parameterize
  end

  def must_belong_to_org_or_owner
    if organization_id.blank? && owner_id.blank?
      errors.add(:base, "Project must belong to an organization or have an owner")
    elsif organization_id.present? && owner_id.present?
      errors.add(:base, "Project cannot belong to both an organization and have a personal owner")
    end
  end
end

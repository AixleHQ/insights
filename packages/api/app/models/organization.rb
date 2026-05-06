class Organization < ApplicationRecord
  has_many :organization_memberships, dependent: :destroy
  has_many :members, through: :organization_memberships, source: :user
  has_many :organization_settings, dependent: :destroy
  has_many :invitations, dependent: :destroy
  has_one :retention_policy, class_name: "OrganizationRetentionPolicy", dependent: :destroy
  has_many :organization_connectors, dependent: :destroy
  has_many :projects, dependent: :destroy
  has_many :tool_events, class_name: "ToolEvent", dependent: :restrict_with_error
  has_many :audit_logs, dependent: :restrict_with_error
  has_many :organization_audit_logs, dependent: :destroy
  has_many :model_pricing_overrides, dependent: :destroy

  validates :name, presence: true
  validates :slug, presence: true, uniqueness: true, format: { with: /\A[a-z0-9]+(?:-[a-z0-9]+)*\z/, message: "must be lowercase alphanumeric with hyphens" }
  validates :is_active, inclusion: { in: [ true, false ] }

  before_validation :generate_slug, on: :create
  before_destroy :flag_as_being_destroyed, prepend: true
  after_create :create_default_retention_policy

  attr_reader :being_destroyed

  scope :active, -> { where(is_active: true) }

  def owners
    members.joins(:organization_memberships).where(organization_memberships: { role: "owner" })
  end

  def admins
    members.joins(:organization_memberships).where(organization_memberships: { role: %w[owner admin] })
  end

  private

  def flag_as_being_destroyed
    @being_destroyed = true
  end

  def generate_slug
    return if slug.present?
    base_slug = name.to_s.parameterize
    self.slug = base_slug
    counter = 1
    while Organization.exists?(slug: slug)
      self.slug = "#{base_slug}-#{counter}"
      counter += 1
    end
  end

  def create_default_retention_policy
    create_retention_policy! unless retention_policy
  end
end

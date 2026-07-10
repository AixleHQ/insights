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
  has_many :retention_purge_logs, dependent: :restrict_with_error
  has_many :model_pricing_overrides, dependent: :destroy
  has_many :notification_routes, dependent: :destroy
  has_many :notifications, dependent: :destroy
  has_many :organization_provider_settings, dependent: :destroy
  has_many :scheduled_exports, dependent: :destroy

  validates :name, presence: true
  validates :slug, presence: true, uniqueness: true, format: { with: /\A[a-z0-9]+(?:-[a-z0-9]+)*\z/, message: "must be lowercase alphanumeric with hyphens" }
  validates :is_active, inclusion: { in: [ true, false ] }
  validates :ingest_rate_limit_per_minute,
            numericality: { only_integer: true, greater_than: 0 },
            allow_blank: true
  validates :ingest_monthly_event_quota,
            numericality: { only_integer: true, greater_than: 0 },
            allow_blank: true

  before_validation :generate_slug, on: :create
  before_destroy :flag_as_being_destroyed, prepend: true
  after_create :create_default_retention_policy
  after_save :persist_ingest_settings

  attr_reader :being_destroyed

  scope :active, -> { where(is_active: true) }

  def ingest_rate_limit_per_minute
    return @ingest_rate_limit_per_minute if defined?(@ingest_rate_limit_per_minute)

    @ingest_rate_limit_per_minute = OrganizationSetting.get(self, "ingest_rate_limit_per_minute")
  end

  def ingest_rate_limit_per_minute=(value)
    @ingest_rate_limit_per_minute = value
    @ingest_rate_limit_per_minute_dirty = true
  end

  def ingest_monthly_event_quota
    return @ingest_monthly_event_quota if defined?(@ingest_monthly_event_quota)

    @ingest_monthly_event_quota = OrganizationSetting.get(self, "ingest_monthly_event_quota")
  end

  def ingest_monthly_event_quota=(value)
    @ingest_monthly_event_quota = value
    @ingest_monthly_event_quota_dirty = true
  end

  def ingest_monthly_event_count
    Rails.cache.read("ingest:quota:#{id}:#{Time.current.strftime('%Y-%m')}").to_i
  end

  def owners
    members.joins(:organization_memberships).where(organization_memberships: { role: "owner" })
  end

  def admins
    members.joins(:organization_memberships).where(organization_memberships: { role: "owner" }) # post-AIX-201: admin removed
  end

  private

  def persist_ingest_settings
    if @ingest_rate_limit_per_minute_dirty
      write_or_clear_ingest_setting("ingest_rate_limit_per_minute", @ingest_rate_limit_per_minute)
      @ingest_rate_limit_per_minute_dirty = false
    end
    if @ingest_monthly_event_quota_dirty
      write_or_clear_ingest_setting("ingest_monthly_event_quota", @ingest_monthly_event_quota)
      @ingest_monthly_event_quota_dirty = false
    end
  end

  def write_or_clear_ingest_setting(key, value)
    if value.to_s.strip.empty?
      organization_settings.where(key: key).destroy_all
    else
      OrganizationSetting.set(self, key, value.to_s)
    end
  end

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

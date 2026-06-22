class Invitation < ApplicationRecord
  STATUSES = %w[pending accepted revoked expired].freeze
  ROLES = OrganizationMembership::ROLES

  belongs_to :organization
  belongs_to :invited_by, class_name: "User"

  validates :email, presence: true, format: { with: URI::MailTo::EMAIL_REGEXP }
  validates :token, presence: true, uniqueness: true
  validates :role, presence: true, inclusion: { in: ROLES }
  validates :status, presence: true, inclusion: { in: STATUSES }
  validates :email, uniqueness: { scope: :organization_id, message: "has already been invited to this organization", conditions: -> { pending } }

  scope :pending, -> { where(status: "pending") }
  scope :accepted, -> { where(status: "accepted") }
  scope :revoked, -> { where(status: "revoked") }
  scope :expired, -> { where(status: "expired") }
  scope :active, -> { pending.where("expires_at > ?", Time.current) }

  before_validation :generate_token, on: :create
  before_validation :set_expiration, on: :create

  def pending?
    status == "pending"
  end

  def accepted?
    status == "accepted"
  end

  def revoked?
    status == "revoked"
  end

  def expired?
    return true if status == "expired"

    pending? && expires_at.present? && expires_at < Time.current
  end

  def active?
    pending? && !expired?
  end

  def accept!(user)
    return false unless active?

    # Idempotent: the user may already be a member (e.g. auto-assigned by
    # UserSyncService domain mapping on login). In that case we still mark the
    # invitation accepted and return the existing membership instead of failing,
    # so the record never gets stranded in "pending" (AIX-289).
    transaction do
      membership = organization.organization_memberships.find_or_create_by!(user: user) do |m|
        m.role = role
      end

      update!(
        status: "accepted",
        accepted_at: Time.current
      )

      membership
    end
  rescue ActiveRecord::RecordNotUnique => e
    retries = retries.to_i + 1
    retry if retries < 3
    raise e
  end

  def revoke!
    return false unless pending?

    update!(status: "revoked")
  end

  def mark_expired!
    return false unless pending?

    update!(status: "expired")
  end

  def accept_url
    "#{ENV.fetch('FRONTEND_URL', 'http://localhost:5173')}/invitations/#{token}"
  end

  private

  def generate_token
    self.token ||= SecureRandom.urlsafe_base64(32)
  end

  def set_expiration
    self.expires_at ||= 7.days.from_now
  end
end

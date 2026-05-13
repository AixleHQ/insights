class NotificationRoute < ApplicationRecord
  NOTIFICATION_TYPES = %w[cost_alert token_alert retention_warning risk_alert].freeze
  RECIPIENT_TYPES    = %w[role user].freeze
  RECIPIENT_ROLES    = %w[owner member viewer].freeze

  belongs_to :organization
  belongs_to :recipient_user, class_name: "User", optional: true

  validates :notification_type, inclusion: { in: NOTIFICATION_TYPES }
  validates :recipient_type,    inclusion: { in: RECIPIENT_TYPES }
  validate  :exactly_one_recipient_target
  validate  :recipient_user_belongs_to_org,
            if: -> { recipient_type == "user" && recipient_user_id.present? }

  private

  def exactly_one_recipient_target
    if recipient_type == "role"
      errors.add(:recipient_role, "must be present") if recipient_role.blank?
      if recipient_user_id.present?
        errors.add(:recipient_user_id, "must be blank for role recipient")
      end
      if recipient_role.present? && !RECIPIENT_ROLES.include?(recipient_role)
        errors.add(:recipient_role, "is not a valid role")
      end
    elsif recipient_type == "user"
      errors.add(:recipient_user_id, "must be present") if recipient_user_id.blank?
      errors.add(:recipient_role, "must be blank for user recipient") if recipient_role.present?
    end
  end

  def recipient_user_belongs_to_org
    return if organization.nil?

    unless organization.members.exists?(id: recipient_user_id)
      errors.add(:recipient_user_id, "must be a member of this organization")
    end
  end
end

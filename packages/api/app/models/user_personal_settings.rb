class UserPersonalSettings < ApplicationRecord
  # Structured per-user preferences — distinct from key/value UserSetting (user_settings table)
  belongs_to :user
  validates :user_id, presence: true, uniqueness: true
  validates :cost_threshold_cents, numericality: { greater_than_or_equal_to: 0, allow_nil: true }
  validates :token_threshold, numericality: { greater_than_or_equal_to: 0, allow_nil: true }
end

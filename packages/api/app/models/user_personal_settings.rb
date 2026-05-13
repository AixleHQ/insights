class UserPersonalSettings < ApplicationRecord
  # Structured per-user preferences — distinct from key/value UserSetting (user_settings table)
  belongs_to :user
  validates :user_id, presence: true, uniqueness: true
end

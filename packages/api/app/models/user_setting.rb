class UserSetting < ApplicationRecord
  belongs_to :user

  validates :key, presence: true, uniqueness: { scope: :user_id }
  validates :value, presence: true

  def self.get(user, key, default: nil)
    setting = find_by(user: user, key: key)
    setting&.value || default
  end

  def self.set(user, key, value)
    setting = find_or_initialize_by(user: user, key: key)
    setting.update!(value: value)
    setting
  end
end

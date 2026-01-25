class OrganizationSetting < ApplicationRecord
  belongs_to :organization

  validates :key, presence: true, uniqueness: { scope: :organization_id }
  validates :value, presence: true

  def self.get(organization, key, default: nil)
    setting = find_by(organization: organization, key: key)
    setting&.value || default
  end

  def self.set(organization, key, value)
    setting = find_or_initialize_by(organization: organization, key: key)
    setting.update!(value: value)
    setting
  end
end

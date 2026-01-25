class ProjectSetting < ApplicationRecord
  belongs_to :project

  validates :key, presence: true, uniqueness: { scope: :project_id }
  validates :value, presence: true

  def self.get(project, key, default: nil)
    setting = find_by(project: project, key: key)
    setting&.value || default
  end

  def self.set(project, key, value)
    setting = find_or_initialize_by(project: project, key: key)
    setting.update!(value: value)
    setting
  end
end

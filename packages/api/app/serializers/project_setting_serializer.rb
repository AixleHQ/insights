# frozen_string_literal: true

class ProjectSettingSerializer < BaseSerializer
  attributes :id, :key, :value
  timestamps

  attribute :project_id do |setting|
    setting.project_id
  end
end

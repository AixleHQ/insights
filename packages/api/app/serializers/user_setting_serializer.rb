# frozen_string_literal: true

class UserSettingSerializer < BaseSerializer
  attributes :id, :key, :value
  timestamps

  attribute :user_id do |setting|
    setting.user_id
  end
end

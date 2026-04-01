# frozen_string_literal: true

class UserSerializer < BaseSerializer
  attributes :id, :email, :name, :avatar_url, :global_admin
  timestamps

  attribute :settings do |user|
    user.user_settings.index_by(&:key).transform_values(&:value)
  end
end

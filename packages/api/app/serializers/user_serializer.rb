# frozen_string_literal: true

class UserSerializer < BaseSerializer
  attributes :id, :email, :name, :global_admin
  timestamps
  datetime_attribute :last_sign_in_at

  attribute :avatar_url do |user|
    user.resolved_avatar_url
  end

  attribute :settings do |user|
    user.user_settings.index_by(&:key).transform_values(&:value)
  end
end

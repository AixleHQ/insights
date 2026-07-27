# frozen_string_literal: true

class UserMinimalSerializer < BaseSerializer
  attributes :id, :email, :name

  attribute :avatar_url do |user|
    user.resolved_avatar_url
  end
end

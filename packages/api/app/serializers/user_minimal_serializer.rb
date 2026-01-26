# frozen_string_literal: true

class UserMinimalSerializer < BaseSerializer
  attributes :id, :email, :name, :avatar_url
end

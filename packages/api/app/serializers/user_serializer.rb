# frozen_string_literal: true

class UserSerializer < BaseSerializer
  attributes :id, :email, :name, :avatar_url, :global_admin
  timestamps
end

# frozen_string_literal: true

class ProjectMembershipSerializer < BaseSerializer
  attributes :id, :role
  timestamps

  attribute :user do |membership|
    ::UserMinimalSerializer.new(membership.user).serializable_hash
  end

  attribute :project_id do |membership|
    membership.project_id
  end
end

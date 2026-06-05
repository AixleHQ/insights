# frozen_string_literal: true

class ProjectMembershipSerializer < BaseSerializer
  attributes :id, :role, :user_id, :project_id, :created_by_id

  attribute :email do |membership|
    membership.user.email
  end

  attribute :name do |membership|
    membership.user.name
  end

  attribute :avatar_url do |membership|
    membership.user.resolved_avatar_url
  end

  attribute :joined_at do |membership|
    membership.created_at
  end
end

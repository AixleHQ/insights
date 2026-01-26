# frozen_string_literal: true

class ProjectMembershipWithProjectSerializer < ProjectMembershipSerializer
  attribute :project do |membership|
    ::ProjectMinimalSerializer.new(membership.project).serializable_hash
  end
end

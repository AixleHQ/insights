# frozen_string_literal: true

class RetentionPurgeLogPolicy < ApplicationPolicy
  # record = current_organization (Organization instance)

  def index?
    org_owner?(record) || global_admin?
  end

  relation_scope do |scope|
    if global_admin?
      scope.all
    elsif user
      scope.where(
        organization_id: user.organization_memberships
                             .where(role: "owner")
                             .select(:organization_id)
      )
    else
      scope.none
    end
  end
end

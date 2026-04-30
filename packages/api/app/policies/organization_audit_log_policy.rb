# frozen_string_literal: true

class OrganizationAuditLogPolicy < ApplicationPolicy
  # record = current_organization (Organization instance)

  def index?
    org_admin?(record) || global_admin?
  end

  # Reserved for a future single-record endpoint; mirrors index? for now
  def show?
    index?
  end

  relation_scope do |scope|
    if global_admin?
      scope.all
    elsif user
      scope.where(
        organization_id: user.organization_memberships.admins.select(:organization_id)
      )
    else
      scope.none
    end
  end
end

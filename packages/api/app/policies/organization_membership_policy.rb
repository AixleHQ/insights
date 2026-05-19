# frozen_string_literal: true

class OrganizationMembershipPolicy < ApplicationPolicy
  # Members can view membership list of their org
  def index?
    org_member?(record.organization) || global_admin?
  end

  # Members can view individual memberships
  def show?
    org_member?(record.organization) || global_admin?
  end

  # Members can view stats of other members
  def stats?
    org_member?(record.organization) || global_admin?
  end

  alias_method :dashboard_stats?, :stats?
  alias_method :member_heatmap?, :stats?

  # Members can view events of other members
  def events?
    org_member?(record.organization) || global_admin?
  end

  # Only owners can add members (post-AIX-201: admin org role removed)
  def create?
    org_admin?(record.organization) || global_admin?
  end

  # Owners can update memberships, but can't demote owners unless they're also an owner (post-AIX-201)
  def update?
    return true if global_admin?
    return false unless org_admin?(record.organization)

    # Can't demote an owner unless you're also an owner
    if record.owner?
      org_owner?(record.organization)
    else
      true
    end
  end

  # Only owners can remove members, but can't remove owners unless they're also an owner (post-AIX-201)
  def destroy?
    return true if global_admin?
    return false unless org_admin?(record.organization)

    # Can't remove an owner unless you're also an owner
    if record.owner?
      org_owner?(record.organization)
    else
      true
    end
  end

  relation_scope do |scope|
    if global_admin?
      scope.all
    elsif organization
      scope.where(organization: organization)
    else
      scope.none
    end
  end
end

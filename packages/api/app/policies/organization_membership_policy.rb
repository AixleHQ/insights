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

  # Personal dashboard endpoints are self-or-admin only — stricter than stats?
  # which allows any org member to view any other member's aggregate stats.
  def dashboard_stats?
    global_admin? ||
      org_owner?(record.organization) ||
      (org_member?(record.organization) && record.user_id == user.id)
  end

  alias_method :member_heatmap?,   :dashboard_stats?
  alias_method :prompt_insights?,  :dashboard_stats?

  # Members can view events of other members
  def events?
    org_member?(record.organization) || global_admin?
  end

  # Only owners can add members (post-AIX-201: admin org role removed)
  def create?
    org_owner?(record.organization) || global_admin?
  end

  # Owners can update memberships, but cannot change their own role.
  # The last-owner downgrade guard is enforced at the model layer.
  def update?
    return true if global_admin?
    return false unless org_owner?(record.organization)
    return false if record.user_id == user.id

    true
  end

  # Only owners can remove members. Owners cannot remove themselves.
  # The last-owner removal guard is enforced at the model layer.
  def destroy?
    return true if global_admin?
    return false unless org_owner?(record.organization)
    return false if record.user_id == user.id

    true
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

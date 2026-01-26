# frozen_string_literal: true

class OrganizationPolicy < ApplicationPolicy
  # Members can view their organization
  def show?
    org_member?(record) || global_admin?
  end

  # Only admins can update the organization
  def update?
    org_admin?(record) || global_admin?
  end

  # Only owners can destroy the organization
  def destroy?
    org_owner?(record) || global_admin?
  end

  # Anyone can create an organization
  def create?
    user.present?
  end

  # Members can view the organization list (their own orgs)
  def index?
    user.present?
  end

  # Only admins can view/update retention policy
  def retention_policy?
    org_admin?(record) || global_admin?
  end

  # Only admins can manage settings
  def settings?
    org_admin?(record) || global_admin?
  end

  relation_scope do |scope|
    if global_admin?
      scope.all
    else
      scope.joins(:organization_memberships)
           .where(organization_memberships: { user_id: user.id })
    end
  end
end

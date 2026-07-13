# frozen_string_literal: true

class UserToolAccountPolicy < ApplicationPolicy
  # Users can view their own tool accounts
  def index?
    own_membership? || global_admin?
  end

  def show?
    own_account? || global_admin?
  end

  # Users can link their own tool accounts — but only if they can contribute
  # data to the org. Viewers are read-only (post-AIX-503).
  def create?
    (own_membership? && can_contribute?) || global_admin?
  end

  # Users can update their own tool accounts, including regenerating ingest
  # tokens. Viewers cannot contribute, so they cannot rotate tokens either.
  def update?
    (own_account? && can_contribute?) || global_admin?
  end

  # Users can unlink their own tool accounts
  def destroy?
    own_account? || global_admin?
  end

  private

  def can_contribute?
    membership = record.is_a?(OrganizationMembership) ? record : record.organization_membership
    membership&.can_manage_projects? || false
  end

  def own_account?
    record.organization_membership&.user_id == user&.id
  end

  def own_membership?
    # For create, record is the organization_membership
    record.is_a?(OrganizationMembership) ? record.user_id == user&.id : own_account?
  end

  relation_scope do |scope|
    if global_admin?
      scope.all
    elsif user
      scope.joins(:organization_membership)
           .where(organization_memberships: { user_id: user.id })
    else
      scope.none
    end
  end
end

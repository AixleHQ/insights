# frozen_string_literal: true

class OrganizationConnectorPolicy < ApplicationPolicy
  # Members can view connectors
  def index?
    org_member?(record.organization) || global_admin?
  end

  def show?
    org_member?(record.organization) || global_admin?
  end

  # Only admins can create connectors
  def create?
    org_admin?(record.organization) || global_admin?
  end

  # Only admins can update connectors
  def update?
    org_admin?(record.organization) || global_admin?
  end

  # Only admins can delete connectors
  def destroy?
    org_admin?(record.organization) || global_admin?
  end

  # Only admins can test connectors
  def test?
    org_admin?(record.organization) || global_admin?
  end

  # Only admins can trigger sync
  def sync?
    org_admin?(record.organization) || global_admin?
  end

  # Only admins can start OAuth flow
  def authorize?
    org_admin?(record.organization) || global_admin?
  end

  # OAuth callback (same as authorize)
  def callback?
    org_admin?(record.organization) || global_admin?
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

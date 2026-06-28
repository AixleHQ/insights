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
    org_owner?(record.organization) || global_admin?
  end

  # Only admins can update connectors
  def update?
    org_owner?(record.organization) || global_admin?
  end

  # Only admins can delete connectors
  def destroy?
    org_owner?(record.organization) || global_admin?
  end

  # Only admins can test connectors
  def test?
    org_owner?(record.organization) || global_admin?
  end

  # Only admins can trigger sync
  def sync?
    org_owner?(record.organization) || global_admin?
  end

  # Members can view sync status
  def sync_status?
    org_member?(record.organization) || global_admin?
  end

  # Only admins can list available repositories from the provider
  def available_repos?
    org_owner?(record.organization) || global_admin?
  end

  # Only admins can list available Jira projects from the provider
  def available_projects?
    org_owner?(record.organization) || global_admin?
  end

  # Only admins can start OAuth flow
  def authorize?
    org_owner?(record.organization) || global_admin?
  end

  # OAuth callback (same as authorize)
  def callback?
    org_owner?(record.organization) || global_admin?
  end

  # Only admins can view health rollup (contains error details)
  def health?
    org_owner?(record.organization) || global_admin?
  end

  # Members can use AI connectors (proxy requests)
  def use?
    org_member?(record.organization) || global_admin?
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

# frozen_string_literal: true

class OrganizationPolicy < ApplicationPolicy
  # Members can view their organization
  def show?
    org_member?(record) || global_admin?
  end

  # Only admins can update the organization
  def update?
    org_owner?(record) || global_admin?
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
    org_owner?(record) || global_admin?
  end

  # Only owners can view retention preview (estimated purge count)
  def retention_preview?
    org_owner?(record) || global_admin?
  end

  # Only admins can manage settings
  def settings?
    org_owner?(record) || global_admin?
  end

  # Admins can view the model pricing table
  def model_pricing?
    org_owner?(record) || global_admin?
  end

  # Admins can manage per-org pricing overrides (index, create, update, destroy)
  def manage_pricing_override?
    org_owner?(record) || global_admin?
  end

  # Members can create events (telemetry ingestion)
  def create_event?
    org_member?(record) || global_admin?
  end

  def list_unattributed?
    org_owner?(record) || global_admin?
  end

  def attribute_bulk?
    org_owner?(record) || global_admin?
  end

  # Only owners can export aggregated reports
  def export_report?
    org_owner?(record) || global_admin?
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

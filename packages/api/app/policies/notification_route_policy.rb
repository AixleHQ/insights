class NotificationRoutePolicy < ApplicationPolicy
  # Intentionally owner-only for all actions — stricter than OrganizationConnectorPolicy
  # (which allows members to view connectors). Alert routing config is sensitive; only
  # owners should see or modify who receives which notification types.
  # global_admin? follows the convention used in all other org-scoped policies.

  # index? receives the organization as record (no single route to authorize against).
  def index?   = org_admin?(record) || global_admin?
  def create?  = org_admin?(record.organization) || global_admin?
  def update?  = org_admin?(record.organization) || global_admin?
  def destroy? = org_admin?(record.organization) || global_admin?
end

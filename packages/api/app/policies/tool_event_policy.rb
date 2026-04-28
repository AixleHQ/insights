# frozen_string_literal: true

class ToolEventPolicy < ApplicationPolicy
  def index?
    org_member?(record_organization) || global_admin?
  end

  def show?
    org_member?(record_organization) || global_admin?
  end

  def create?
    org_member?(record_organization) || global_admin?
  end

  def update?
    org_admin?(record_organization) || global_admin?
  end

  def destroy?
    org_admin?(record_organization) || global_admin?
  end

  # Scoped query for authorized events
  relation_scope do |scope|
    if global_admin?
      scope.all
    elsif organization
      scope.where(organization_id: organization.id)
    else
      scope.where(organization_id: user.organization_ids)
    end
  end

  private

  def record_organization
    @record_organization ||= if record.is_a?(ToolEvent)
                               record.organization
    else
                               organization
    end
  end
end

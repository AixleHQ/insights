# frozen_string_literal: true

class ProjectConnectorPolicy < ApplicationPolicy
  # Project members can view connectors
  def index?
    can_view_project?
  end

  def show?
    can_view_project?
  end

  # Only project admins/owners can create connectors
  def create?
    can_manage_project?
  end

  def update?
    can_manage_project?
  end

  def destroy?
    can_manage_project?
  end

  def test?
    can_manage_project?
  end

  def sync?
    can_manage_project?
  end

  relation_scope do |scope|
    if global_admin?
      scope.all
    elsif user
      project_ids = Project.where(owner_id: user.id)
                           .or(Project.joins(:project_memberships).where(project_memberships: { user_id: user.id }))
                           .pluck(:id)
      scope.where(project_id: project_ids)
    else
      scope.none
    end
  end

  private

  def can_view_project?
    return true if global_admin?
    project = record.project
    return true if project.personal? && project.owner_id == user&.id
    return project_member?(project) if project.organization_project?
    false
  end

  def can_manage_project?
    return true if global_admin?
    project = record.project
    return true if project.personal? && project.owner_id == user&.id
    return project_admin?(project) || org_admin?(project.organization) if project.organization_project?
    false
  end
end

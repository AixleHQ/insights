# frozen_string_literal: true

class RepositoryPolicy < ApplicationPolicy
  # Project members can view repositories
  def show?
    can_view_project?
  end

  def index?
    can_view_project?
  end

  # Project admins can add repositories
  def create?
    can_manage_project?
  end

  # Project admins can update repositories
  def update?
    can_manage_project?
  end

  # Project admins can remove repositories
  def destroy?
    can_manage_project?
  end

  # Project admins can trigger sync
  def sync?
    can_manage_project?
  end

  private

  def can_view_project?
    return true if global_admin?
    project = record.project
    return project.owner_id == user&.id if project.personal?
    org_member?(project.organization)
  end

  def can_manage_project?
    return true if global_admin?
    project = record.project
    return project.owner_id == user&.id if project.personal?
    project_admin?(project)
  end

  relation_scope do |scope|
    if global_admin?
      scope.all
    elsif user
      # Repositories for projects user can access
      org_ids = user.organization_ids
      project_ids = Project.where(owner_id: user.id)
                           .or(Project.where(organization_id: org_ids))
                           .pluck(:id)
      scope.where(project_id: project_ids)
    else
      scope.none
    end
  end
end

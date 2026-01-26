# frozen_string_literal: true

class ProjectMembershipPolicy < ApplicationPolicy
  # Project members can view membership list
  def index?
    can_view_project?
  end

  def show?
    can_view_project?
  end

  # Project admins can add members
  def create?
    project_admin?(record.project) || global_admin?
  end

  # Project admins can update memberships
  def update?
    return true if global_admin?
    return false unless project_admin?(record.project)

    # Can't demote an owner unless you're also an owner
    if record.owner?
      project_owner?(record.project)
    else
      true
    end
  end

  # Project admins can remove members
  def destroy?
    return true if global_admin?
    return false unless project_admin?(record.project)

    # Can't remove an owner unless you're also an owner
    if record.owner?
      project_owner?(record.project)
    else
      true
    end
  end

  private

  def can_view_project?
    return true if global_admin?
    project = record.project
    return project.owner_id == user&.id if project.personal?
    org_member?(project.organization)
  end

  relation_scope do |scope|
    if global_admin?
      scope.all
    elsif user
      # Memberships for projects user can access
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

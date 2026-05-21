# frozen_string_literal: true

class ProjectMembershipPolicy < ApplicationPolicy
  def index?
    can_view_membership_list?
  end

  def show?
    can_view_membership_list?
  end

  # Collection stats (all members) and per-member breakdown — project leads only
  def stats?
    return true if global_admin?

    project_owner?(record.project)
  end

  def create?
    can_mutate_membership?
  end

  def update?
    can_mutate_membership?
  end

  def destroy?
    can_mutate_membership?
  end

  private

  def can_view_membership_list?
    return true if global_admin?

    project = record.project
    return project.owner_id == user&.id if project.personal?

    project_owner?(project) || project_member?(project)
  end

  def can_mutate_membership?
    return true if global_admin?

    project = record.project
    return project_owner?(project) if project.personal?

    org_owner?(project.organization)
  end

  relation_scope do |scope|
    if global_admin?
      scope.all
    elsif user
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

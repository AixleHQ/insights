# frozen_string_literal: true

class ProjectMembershipPolicy < ApplicationPolicy
  # Org owners and project row-owners can view the membership list
  def index?
    can_view_membership_list?
  end

  def show?
    can_view_membership_list?
  end

  def stats?
    can_view_membership_list?
  end

  # Only org owners can add/change/remove members (or personal project owners / global admin)
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

    # project_owner? returns true for org owners (implicit) and row-owners
    project_owner?(project)
  end

  def can_mutate_membership?
    return true if global_admin?

    project = record.project
    # Personal projects: project owner manages their own memberships
    return project_owner?(project) if project.personal?

    # Org projects: only org owners can manage project memberships (AIX-202)
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

# frozen_string_literal: true

class ProjectPolicy < ApplicationPolicy
  def show?
    return true if global_admin?
    return own_personal_project? if record.personal?
    return project_member?(record) || project_owner?(record) if record.organization_project?
    false
  end

  # Organization members can list org projects
  def index?
    user.present?
  end

  # Org owners can create org projects; users can create personal projects
  def create?
    return true if global_admin?
    return true if record.personal? && record.owner_id == user&.id
    return org_owner?(record.organization) if record.organization_project?
    false
  end

  # Admins can update org projects
  # Owners can update personal projects
  def update?
    return true if global_admin?
    return own_personal_project? if record.personal?
    return project_admin?(record) if record.organization_project?
    false
  end

  # Only owners can destroy projects
  def destroy?
    return true if global_admin?
    return own_personal_project? if record.personal?
    return project_owner?(record) || org_owner?(record.organization) if record.organization_project?
    false
  end

  # Project settings access
  def settings?
    update?
  end

  # Linking a Jira project requires the same permission as updating the project
  def link_jira?
    update?
  end

  def link_linear?
    update?
  end

  def sync_issues?
    update?
  end

  # Only project admins/owners can view audit logs
  def audit_logs?
    return true if global_admin?
    return own_personal_project? if record.personal?
    return project_admin?(record) if record.organization_project?
    false
  end

  private

  def own_personal_project?
    record.personal? && record.owner_id == user&.id
  end

  relation_scope do |scope|
    if global_admin?
      scope.all
    elsif user
      personal = scope.where(owner_id: user.id)
      # Projects the user has an explicit membership for
      member_project_ids = user.project_memberships.select(:project_id)
      member_org_projects = scope.where(id: member_project_ids)
      # Org owners see all projects in their owned orgs
      owned_org_ids = user.organization_memberships.owners.select(:organization_id)
      owned_org_projects = scope.where(organization_id: owned_org_ids)
      personal.or(member_org_projects).or(owned_org_projects)
    else
      scope.none
    end
  end
end

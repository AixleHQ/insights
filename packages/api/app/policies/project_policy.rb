# frozen_string_literal: true

class ProjectPolicy < ApplicationPolicy
  # Organization members can view org projects
  # Users can view their personal projects
  def show?
    return true if global_admin?
    return own_personal_project? if record.personal?
    return org_member?(record.organization) if record.organization_project?
    false
  end

  # Organization members can list org projects
  def index?
    user.present?
  end

  # Members can create projects in their org
  # Users can create personal projects
  def create?
    return true if global_admin?
    return true if record.personal? && record.owner_id == user&.id
    return org_member?(record.organization) if record.organization_project?
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

  # Retention policy access
  def retention_policy?
    update?
  end

  # Linking a Jira project requires the same permission as updating the project
  def link_jira?
    update?
  end

  private

  def own_personal_project?
    record.personal? && record.owner_id == user&.id
  end

  relation_scope do |scope|
    if global_admin?
      scope.all
    elsif user
      # User's personal projects OR projects from their organizations
      org_ids = user.organization_ids
      scope.where(owner_id: user.id)
           .or(scope.where(organization_id: org_ids))
    else
      scope.none
    end
  end
end

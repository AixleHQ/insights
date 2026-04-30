# frozen_string_literal: true

class ProjectAuditLogPolicy < ApplicationPolicy
  # record = @project (Project instance)

  def index?
    return true if global_admin?
    return own_personal_project? if record.personal?
    return project_admin?(record) || org_admin?(record.organization) if record.organization_project?

    false
  end

  # Reserved for a future single-record endpoint; mirrors index? for now
  def show?
    index?
  end

  # Full access = ip_address and tracked_changes visible (org-admin level and above)
  def full_access?
    @full_access ||= begin
      return true if global_admin?
      return own_personal_project? if record.personal?
      return org_admin?(record.organization) if record.organization_project?

      false
    end
  end

  relation_scope do |scope|
    # NOTE: `record` here is ProjectAuditLog (the class), not the project instance.
    # Use `user` and membership scopes directly; do not reference `record`.
    if global_admin?
      scope.all
    elsif user
      project_admin_ids = user.project_memberships.admins.select(:project_id)
      accessible_project_ids = Project
        .where(organization_id: user.organization_memberships.admins.select(:organization_id))
        .or(Project.where(owner: user, organization: nil))
        .select(:id)
      scope.where(project_id: project_admin_ids)
           .or(scope.where(project_id: accessible_project_ids))
    else
      scope.none
    end
  end

  private

  def own_personal_project?
    record.personal? && record.owner_id == user&.id
  end
end

# frozen_string_literal: true

class ApplicationPolicy < ActionPolicy::Base
  authorize :user, allow_nil: true
  authorize :organization, allow_nil: true

  def global_admin?
    user&.global_admin?
  end

  def org_member?(org = organization)
    return false unless user && org
    user.member_of?(org)
  end

  def org_owner?(org = organization)
    return false unless user && org
    user.role_in(org) == "owner"
  end

  def org_role(org = organization)
    return nil unless user && org
    user.role_in(org)
  end

  def membership_for(org = organization)
    return nil unless user && org
    user.organization_memberships.find_by(organization: org)
  end

  def project_member?(project)
    return false unless user && project
    return false unless project.members.exists?(id: user.id)
    # Orphaned project_memberships after leave must not grant access (AIX-611).
    return true unless project.organization_project?

    org_member?(project.organization)
  end

  def project_admin?(project)
    project_owner?(project) # post-AIX-202: admin == owner; delegate to project_owner?
  end

  def project_owner?(project)
    return false unless user && project
    return true if project.personal? && project.owner_id == user.id
    # Org owners are implicit project owners — no project_memberships row required (AIX-202)
    return true if project.organization_project? && org_owner?(project.organization)

    membership = project.project_memberships.find_by(user: user)
    return false unless membership&.owner?
    return true unless project.organization_project?

    org_member?(project.organization)
  end

  def project_can_edit?(project)
    return false unless user && project
    return true if project.personal? && project.owner_id == user.id
    membership = project.project_memberships.find_by(user: user)
    return false unless membership&.can_edit?
    return true unless project.organization_project?

    # Orphaned project_memberships after leave must not grant edit (AIX-611).
    org_member?(project.organization)
  end

  def same_user?(target_user)
    user && target_user && user.id == target_user.id
  end

  def org_alert_policy(org = organization)
    org&.retention_policy
  end

  def project_alert_policy(project)
    project&.retention_policy
  end

  def personal_alert_setting
    user&.personal_setting
  end

  alias_rule :edit?, :update?, :destroy?, to: :manage?
end

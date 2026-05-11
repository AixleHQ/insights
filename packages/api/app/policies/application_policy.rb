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

  def org_admin?(org = organization)
    # post-AIX-201: delegates to admin_of? which now means owner-only
    # TODO AIX-XXX: deprecate in favour of org_owner? and sweep callers
    return false unless user && org
    user.admin_of?(org)
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
    project.members.exists?(id: user.id)
  end

  def project_admin?(project)
    return false unless user && project
    membership = project.project_memberships.find_by(user: user)
    membership&.admin?
  end

  def project_owner?(project)
    return false unless user && project
    return true if project.personal? && project.owner_id == user.id
    membership = project.project_memberships.find_by(user: user)
    membership&.owner?
  end

  def project_can_edit?(project)
    return false unless user && project
    return true if project.personal? && project.owner_id == user.id
    membership = project.project_memberships.find_by(user: user)
    membership&.can_edit?
  end

  def same_user?(target_user)
    user && target_user && user.id == target_user.id
  end

  alias_rule :edit?, :update?, :destroy?, to: :manage?
end

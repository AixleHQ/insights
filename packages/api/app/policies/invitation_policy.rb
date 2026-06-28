# frozen_string_literal: true

class InvitationPolicy < ApplicationPolicy
  # List invitations for an organization
  def index?
    org_owner?(record.organization) || global_admin?
  end

  # View invitation details
  def show?
    org_owner?(record.organization) || global_admin?
  end

  # Create new invitation (send invite)
  def create?
    org_owner?(record.organization) || global_admin?
  end

  # Revoke pending invitation
  def destroy?
    return false unless record.pending?
    org_owner?(record.organization) || global_admin?
  end

  # Resend invitation email
  def resend?
    return false unless record.pending?
    org_owner?(record.organization) || global_admin?
  end

  # Accept invitation (anyone with valid token can accept)
  # This is handled separately in the public controller
  def accept?
    true
  end
end

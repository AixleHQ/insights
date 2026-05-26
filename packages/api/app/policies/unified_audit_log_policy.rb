# frozen_string_literal: true

class UnifiedAuditLogPolicy < ApplicationPolicy
  # record = current_organization
  def index?
    org_owner?(record) || global_admin?
  end

  def export?
    index?
  end
end

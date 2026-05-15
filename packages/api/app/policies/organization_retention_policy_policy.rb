# frozen_string_literal: true

class OrganizationRetentionPolicyPolicy < ApplicationPolicy
  # ApplicationPolicy aliases edit?, update?, destroy? → manage?; add show? and create? here.
  alias_rule :show?, :create?, to: :manage?

  def manage? = org_admin?(record.organization) || global_admin?
end

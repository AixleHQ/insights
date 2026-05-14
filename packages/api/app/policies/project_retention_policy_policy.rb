# frozen_string_literal: true

class ProjectRetentionPolicyPolicy < ApplicationPolicy
  # ApplicationPolicy aliases edit?, update?, destroy? → manage?; add show? and create? here.
  # project_owner? covers: personal project owner, org owner (AIX-202), project membership owner row.
  alias_rule :show?, :create?, to: :manage?

  def manage? = project_owner?(record.project) || global_admin?
end

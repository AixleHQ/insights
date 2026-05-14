# frozen_string_literal: true

class UserPersonalSettingsPolicy < ApplicationPolicy
  # ApplicationPolicy aliases edit?, update?, destroy? → manage?; add show? and create? here.
  alias_rule :show?, :create?, to: :manage?

  def manage? = same_user?(record.user) || global_admin?
end

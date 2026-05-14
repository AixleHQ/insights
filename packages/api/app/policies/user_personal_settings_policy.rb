# frozen_string_literal: true

class UserPersonalSettingsPolicy < ApplicationPolicy
  def show?    = same_user?(record.user) || global_admin?
  def create?  = same_user?(record.user) || global_admin?
  def update?  = same_user?(record.user) || global_admin?
  def destroy? = same_user?(record.user) || global_admin?
end

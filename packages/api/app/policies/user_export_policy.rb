# frozen_string_literal: true

class UserExportPolicy < ApplicationPolicy
  # Any authenticated user may export their own data; global admins can export anyone's.
  def show? = same_user?(record) || global_admin?
end

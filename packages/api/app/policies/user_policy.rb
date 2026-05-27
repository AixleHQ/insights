# frozen_string_literal: true

class UserPolicy < ApplicationPolicy
  # Users can view their own profile
  def show?
    same_user?(record) || global_admin?
  end

  # Users can update their own profile
  def update?
    same_user?(record) || global_admin?
  end

  # Only global admins can destroy users
  def destroy?
    global_admin?
  end

  # Only global admins can list all users
  def index?
    global_admin?
  end

  # Anyone can view their own organizations
  def organizations?
    same_user?(record) || global_admin?
  end

  # Users can view their own settings
  def settings?
    same_user?(record) || global_admin?
  end

  # Current user's ingest tool-account metadata in org context (Settings)
  def tool_accounts?
    same_user?(record) || global_admin?
  end

  # Only the impersonated user (or global admin) can terminate the impersonation session
  def stop_impersonation?
    same_user?(record) || global_admin?
  end

  relation_scope do |scope|
    if global_admin?
      scope.all
    else
      scope.where(id: user.id)
    end
  end
end

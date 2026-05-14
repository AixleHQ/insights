# frozen_string_literal: true

class ProjectRetentionPolicyPolicy < ApplicationPolicy
  # project_owner? covers: personal project owner, org owner (AIX-202), project membership owner row
  def show?    = project_owner?(record.project) || global_admin?
  def create?  = project_owner?(record.project) || global_admin?
  def update?  = project_owner?(record.project) || global_admin?
  def destroy? = project_owner?(record.project) || global_admin?
end

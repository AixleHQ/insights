# frozen_string_literal: true

class OrganizationRetentionPolicyPolicy < ApplicationPolicy
  def show?    = org_admin?(record.organization) || global_admin?
  def create?  = org_admin?(record.organization) || global_admin?
  def update?  = org_admin?(record.organization) || global_admin?
  def destroy? = org_admin?(record.organization) || global_admin?
end

# frozen_string_literal: true

class ScheduledExportPolicy < ApplicationPolicy
  # index? receives the organization as record (authorized explicitly with `with:`)
  def index?   = org_owner?(record) || global_admin?
  def create?  = org_owner?(record.organization) || global_admin?
  def update?  = org_owner?(record.organization) || global_admin?
  def destroy? = org_owner?(record.organization) || global_admin?
end

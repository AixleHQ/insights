# frozen_string_literal: true

class ExportRecordPolicy < ApplicationPolicy
  # index? and create? receive the organization as record (authorized with `with:`)
  def index?  = org_owner?(record) || global_admin?
  def create? = org_owner?(record) || global_admin?
end

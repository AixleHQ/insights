# frozen_string_literal: true

class OrganizationProviderSettingPolicy < ApplicationPolicy
  # record is an Organization (authorized via `authorize! @organization, with: OrganizationProviderSettingPolicy`)

  def index?
    org_member?(record)
  end

  def update?
    org_owner?(record)
  end
end

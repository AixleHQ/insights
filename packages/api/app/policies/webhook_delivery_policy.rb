# frozen_string_literal: true

class WebhookDeliveryPolicy < ApplicationPolicy
  # index?: record = Organization instance (authorized via current_organization)
  def index?
    org_owner?(record) || global_admin?
  end

  # retry?: record = WebhookDelivery instance
  def retry?
    org_owner?(record.organization_connector.organization) || global_admin?
  end

  relation_scope do |scope|
    if global_admin?
      scope.all
    elsif user
      scope.joins(:organization_connector)
           .where(
             organization_connectors: {
               organization_id: user.organization_memberships.admins.select(:organization_id)
             }
           )
    else
      scope.none
    end
  end
end

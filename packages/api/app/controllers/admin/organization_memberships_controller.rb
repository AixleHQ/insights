# frozen_string_literal: true

module Admin
  class OrganizationMembershipsController < ApplicationController
    private

    def dashboard_class
      OrganizationMembershipDashboard
    end

    def resource_class
      OrganizationMembership
    end

    def resource_name
      "organization_membership"
    end

    def scoped_resource
      resource_class.includes(:user, :organization).order(created_at: :desc)
    end
  end
end

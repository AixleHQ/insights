# frozen_string_literal: true

module Admin
  class OrganizationRetentionPoliciesController < ApplicationController
    private

    def dashboard_class
      OrganizationRetentionPolicyDashboard
    end

    def resource_class
      OrganizationRetentionPolicy
    end

    def resource_name
      'organization_retention_policy'
    end

    def scoped_resource
      resource_class.includes(:organization).order(created_at: :desc)
    end
  end
end

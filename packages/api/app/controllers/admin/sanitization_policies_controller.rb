# frozen_string_literal: true

module Admin
  class SanitizationPoliciesController < ApplicationController
    def export
      policies = SanitizationPolicy.order(created_at: :desc)
      respond_to do |format|
        format.csv do
          send_data generate_csv(policies), filename: "sanitization-policies-#{Date.current}.csv"
        end
      end
    end

    def batch_delete
      ids = params[:ids]
      SanitizationPolicy.where(id: ids).destroy_all
      redirect_to admin_sanitization_policies_path, notice: "Successfully deleted #{ids.count} policies."
    end

    def activate
      policy = SanitizationPolicy.find(params[:id])
      policy.update!(is_active: true)
      redirect_to admin_sanitization_policy_path(policy), notice: 'Policy activated.'
    end

    def deactivate
      policy = SanitizationPolicy.find(params[:id])
      policy.update!(is_active: false)
      redirect_to admin_sanitization_policy_path(policy), notice: 'Policy deactivated.'
    end

    private

    def generate_csv(policies)
      require 'csv'
      CSV.generate(headers: true) do |csv|
        csv << %w[id name is_active version created_at]
        policies.find_each do |policy|
          csv << [policy.id, policy.name, policy.is_active, policy.version, policy.created_at]
        end
      end
    end

    def dashboard_class
      SanitizationPolicyDashboard
    end

    def resource_class
      SanitizationPolicy
    end

    def resource_name
      'sanitization_policy'
    end

    def scoped_resource
      resource_class.order(created_at: :desc)
    end
  end
end

# frozen_string_literal: true

module Admin
  class ProjectMembershipsController < ApplicationController
    private

    def dashboard_class
      ProjectMembershipDashboard
    end

    def resource_class
      ProjectMembership
    end

    def resource_name
      'project_membership'
    end

    def scoped_resource
      resource_class.includes(:user, :project).order(created_at: :desc)
    end
  end
end

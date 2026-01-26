# frozen_string_literal: true

module Admin
  class RepositoriesController < ApplicationController
    private

    def dashboard_class
      RepositoryDashboard
    end

    def resource_class
      Repository
    end

    def resource_name
      'repository'
    end

    def scoped_resource
      resource_class.includes(:project).order(created_at: :desc)
    end
  end
end

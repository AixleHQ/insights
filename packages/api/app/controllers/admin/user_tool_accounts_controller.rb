# frozen_string_literal: true

module Admin
  class UserToolAccountsController < ApplicationController
    private

    def dashboard_class
      UserToolAccountDashboard
    end

    def resource_class
      UserToolAccount
    end

    def resource_name
      "user_tool_account"
    end

    def scoped_resource
      resource_class.includes(:user, :organization).order(created_at: :desc)
    end
  end
end

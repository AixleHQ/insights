# frozen_string_literal: true

module Admin
  class InvitationsController < ApplicationController
    def dashboard_class
      InvitationDashboard
    end

    def resource_class
      Invitation
    end

    def resource_name
      "invitation"
    end

    def scoped_resource
      resource_class.includes(:organization, :invited_by).order(created_at: :desc)
    end
  end
end

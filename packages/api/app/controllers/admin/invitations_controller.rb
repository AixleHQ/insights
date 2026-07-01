# frozen_string_literal: true

module Admin
  class InvitationsController < Admin::ApplicationController
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

    def create
      resource = resource_class.new(resource_params)
      resource.invited_by = current_admin_user

      if resource.save
        InvitationMailer.invite(resource).deliver_later
        redirect_to(
          [ namespace, resource ],
          notice: translate_with_resource("create.success")
        )
      else
        render :new, locals: { page: Administrate::Page::Form.new(dashboard, resource) },
               status: :unprocessable_content
      end
    end
  end
end

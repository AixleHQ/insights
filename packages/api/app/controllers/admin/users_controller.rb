# frozen_string_literal: true

module Admin
  class UsersController < Admin::ApplicationController
    # Administrate's default create doesn't set keycloak_sub, which is required.
    # Generate a placeholder so admins can create users; UserSyncService will
    # replace it with the real Keycloak sub when the user first logs in (email match).
    def create
      resource = resource_class.new(resource_params)
      resource.keycloak_sub ||= "pending-#{SecureRandom.uuid}"

      if resource.save
        redirect_to(
          [ namespace, resource ],
          notice: translate_with_resource("create.success")
        )
      else
        render :new, locals: { page: Administrate::Page::Form.new(dashboard, resource) },
               status: :unprocessable_entity
      end
    end

    def impersonate
      user = User.find(params[:id])

      AdminAuditLog.create!(
        admin_user: current_admin_user,
        action: "impersonate",
        resource_type: "User",
        resource_id: user.id,
        metadata: { impersonated_user_email: user.email },
        ip_address: request.remote_ip,
        user_agent: request.user_agent
      )

      user.organizations.each do |organization|
        OrganizationAuditLog.log(
          organization: organization,
          actor: current_admin_user,
          action: "impersonation.started",
          resource: user,
          metadata: { impersonator_email: current_admin_user.email },
          request: request
        )
      end

      user.projects.each do |project|
        ProjectAuditLog.log(
          project: project,
          actor: current_admin_user,
          action: "impersonation.started",
          resource: user,
          metadata: { impersonator_email: current_admin_user.email },
          request: request
        )
      end

      # Generate an impersonation token
      token = ImpersonationService.generate_token(
        admin_user: current_admin_user,
        target_user: user
      )

      # Redirect to frontend with impersonation token
      frontend_url = ENV.fetch("FRONTEND_URL", "http://localhost:5173")
      redirect_to "#{frontend_url}/?impersonate=#{token}", allow_other_host: true
    end

    def stop_impersonation
      session.delete(:impersonated_user_id)
      session.delete(:admin_user_id)
      redirect_to admin_users_path, notice: "Stopped impersonating user."
    end

    def export
      users = User.all
      respond_to do |format|
        format.csv do
          send_data generate_csv(users), filename: "users-#{Date.current}.csv"
        end
      end
    end

    private

    def generate_csv(users)
      require "csv"
      CSV.generate(headers: true) do |csv|
        csv << %w[id email name global_admin created_at]
        users.find_each do |user|
          csv << [ user.id, user.email, user.name, user.global_admin, user.created_at ]
        end
      end
    end
  end
end

# frozen_string_literal: true

module Admin
  class UsersController < Admin::ApplicationController
    def impersonate
      user = User.find(params[:id])

      AdminAuditLog.create!(
        admin_user: current_admin_user,
        action: 'impersonate',
        resource_type: 'User',
        resource_id: user.id,
        metadata: { impersonated_user_email: user.email },
        ip_address: request.remote_ip,
        user_agent: request.user_agent
      )

      # Generate an impersonation token
      token = ImpersonationService.generate_token(
        admin_user: current_admin_user,
        target_user: user
      )

      # Redirect to frontend with impersonation token
      frontend_url = ENV.fetch('FRONTEND_URL', 'http://localhost:5173')
      redirect_to "#{frontend_url}/?impersonate=#{token}", allow_other_host: true
    end

    def stop_impersonation
      session.delete(:impersonated_user_id)
      session.delete(:admin_user_id)
      redirect_to admin_users_path, notice: 'Stopped impersonating user.'
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
      require 'csv'
      CSV.generate(headers: true) do |csv|
        csv << %w[id email name global_admin created_at]
        users.find_each do |user|
          csv << [user.id, user.email, user.name, user.global_admin, user.created_at]
        end
      end
    end
  end
end

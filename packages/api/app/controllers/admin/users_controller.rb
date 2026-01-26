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

      # Store impersonation info in session
      session[:impersonated_user_id] = user.id
      session[:admin_user_id] = current_admin_user.id

      redirect_to admin_root_path, notice: "Now impersonating #{user.display_name}. Refresh the main app to see changes."
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

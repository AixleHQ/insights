# frozen_string_literal: true

module Admin
  class AdminAuditLogsController < ApplicationController
    # Index is inherited from Administrate::ApplicationController
    # Show is inherited from Administrate::ApplicationController

    def export
      logs = AdminAuditLog.includes(:admin_user).order(created_at: :desc)
      respond_to do |format|
        format.csv do
          send_data generate_csv(logs), filename: "admin-audit-logs-#{Date.current}.csv"
        end
      end
    end

    private

    def generate_csv(logs)
      require "csv"
      CSV.generate(headers: true) do |csv|
        csv << %w[id admin_user_email action resource_type resource_id ip_address created_at]
        logs.find_each do |log|
          csv << [ log.id, log.admin_user&.email, log.action, log.resource_type, log.resource_id, log.ip_address, log.created_at ]
        end
      end
    end

    def dashboard_class
      AdminAuditLogDashboard
    end

    def resource_class
      AdminAuditLog
    end

    def resource_name
      "admin_audit_log"
    end

    def scoped_resource
      resource_class.includes(:admin_user).order(created_at: :desc)
    end
  end
end

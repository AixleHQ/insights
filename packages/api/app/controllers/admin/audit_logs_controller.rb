# frozen_string_literal: true

module Admin
  class AuditLogsController < ApplicationController
    # Index is inherited from Administrate::ApplicationController
    # Show is inherited from Administrate::ApplicationController

    def export
      audit_logs = AuditLog.order(created_at: :desc)
      respond_to do |format|
        format.csv do
          send_data generate_csv(audit_logs), filename: "audit-logs-#{Date.current}.csv"
        end
      end
    end

    private

    def generate_csv(audit_logs)
      require "csv"
      CSV.generate(headers: true) do |csv|
        csv << %w[id user_id action resource_type resource_id created_at]
        audit_logs.find_each do |log|
          csv << [ log.id, log.user_id, log.action, log.resource_type, log.resource_id, log.created_at ]
        end
      end
    end

    def dashboard_class
      AuditLogDashboard
    end

    def resource_class
      AuditLog
    end

    def resource_name
      "audit_log"
    end

    def scoped_resource
      resource_class.order(created_at: :desc)
    end
  end
end

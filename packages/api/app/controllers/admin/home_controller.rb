# frozen_string_literal: true

module Admin
  class HomeController < Admin::ApplicationController
    def index
      @stats = {
        users: {
          total: User.count,
          global_admins: User.global_admins.count,
          new_this_week: User.where("created_at > ?", 1.week.ago).count
        },
        organizations: {
          total: Organization.count,
          active: Organization.active.count
        },
        projects: {
          total: Project.count,
          organization_projects: Project.organization_projects.count,
          personal_projects: Project.personal_projects.count
        },
        connectors: {
          total: OrganizationConnector.count,
          active: OrganizationConnector.active.count,
          by_type: OrganizationConnector.group(:connector_type).count
        },
        tool_events: {
          total: ToolEvent.count,
          today: ToolEvent.where("created_at > ?", Time.current.beginning_of_day).count,
          this_week: ToolEvent.where("created_at > ?", 1.week.ago).count
        },
        audit_logs: {
          total: AuditLog.count,
          today: AuditLog.where("created_at > ?", Time.current.beginning_of_day).count
        }
      }
    end
  end
end

# frozen_string_literal: true

module Api
  module V1
    class ProjectAuditLogsController < BaseController
      before_action :set_project

      # GET /api/v1/projects/:project_id/audit_logs
      def index
        authorize! @project, to: :index?, with: ProjectAuditLogPolicy

        logs = authorized_scope(
          @project.project_audit_logs
                  .includes(:actor)
                  .order(created_at: :desc),
          with: ProjectAuditLogPolicy
        )

        logs = logs.by_actor(params[:actor_id]) if params[:actor_id].present?
        logs = logs.by_action(params[:log_action]) if params[:log_action].present?
        logs = logs.by_resource_type(params[:resource_type]) if params[:resource_type].present?
        if params[:from_date].present?
          from_date = parse_audit_log_date_param(params[:from_date], :from_date, boundary: :start) or return
          logs = logs.from_date(from_date)
        end

        if params[:to_date].present?
          to_date = parse_audit_log_date_param(params[:to_date], :to_date, boundary: :end) or return
          logs = logs.to_date(to_date)
        end

        paginated = paginate(logs)
        full_access = allowed_to?(:full_access?, @project, with: ProjectAuditLogPolicy)

        render json: {
          data: ProjectAuditLogSerializer.new(paginated, params: { full_access: full_access }).serialize,
          meta: pagination_meta(paginated)
        }
      end

      private

      def set_project
        # Use authorized_scope so unauthorized project IDs 404 rather than 403-after-load,
        # consistent with IssuesController
        @project = authorized_scope(Project.all).find(params[:project_id])
        reject_inactive_organization!(@project.organization) if @project.organization_id.present?
      end
    end
  end
end

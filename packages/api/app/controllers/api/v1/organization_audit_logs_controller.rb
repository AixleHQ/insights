# frozen_string_literal: true

module Api
  module V1
    class OrganizationAuditLogsController < BaseController
      before_action :require_organization!

      # GET /api/v1/organizations/:organization_id/audit_logs
      def index
        authorize! current_organization, to: :index?, with: OrganizationAuditLogPolicy

        logs = authorized_scope(
          current_organization.organization_audit_logs
                              .includes(:actor)
                              .order(created_at: :desc),
          with: OrganizationAuditLogPolicy
        )

        logs = logs.by_actor(params[:actor_id]) if params[:actor_id].present?
        logs = logs.by_action(params[:log_action]) if params[:log_action].present?
        logs = logs.by_resource_type(params[:resource_type]) if params[:resource_type].present?
        if params[:from_date].present?
          from_date = parse_date_param(params[:from_date], :from_date) or return
          logs = logs.from_date(from_date)
        end

        if params[:to_date].present?
          to_date = parse_date_param(params[:to_date], :to_date) or return
          logs = logs.to_date(to_date)
        end

        paginated = paginate(logs)

        render json: {
          data: OrganizationAuditLogSerializer.new(paginated).serialize,
          meta: pagination_meta(paginated)
        }
      end
    end
  end
end

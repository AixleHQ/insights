# frozen_string_literal: true

module Api
  module V1
    class EventsController < BaseController
      include ToolEventFilterable

      before_action :require_organization!
      before_action :set_event, only: %i[show audit_trail]

      EXPORT_ROW_CAP = 100_000

      # GET /api/v1/organizations/:organization_id/events
      def index
        events = authorized_scope(current_organization.tool_events)
        events = apply_filters(events)
        events = events.includes(:user, :project).order(occurred_at: :desc)

        render_collection(events, ToolEventSerializer)
      end

      # GET /api/v1/organizations/:organization_id/events/:id
      def show
        authorize! @event
        render_resource(@event, ToolEventDetailSerializer)
      end

      # GET /api/v1/organizations/:organization_id/events/summary
      def summary
        authorize! current_organization, to: :show?

        events = current_organization.tool_events
        events = apply_time_filter(events)

        summary_data = {
          totalEvents: events.count,
          totalTokensIn: events.sum(:tokens_in),
          totalTokensOut: events.sum(:tokens_out),
          totalCostUsd: events.sum(:cost_usd).to_f,
          byTool: events.group(:tool_name).count,
          byEventType: events.group(:event_type).count,
          byUser: events.where.not(user_id: nil).group(:user_id).count,
          timeRange: {
            start: events.minimum(:occurred_at)&.iso8601,
            end: events.maximum(:occurred_at)&.iso8601
          }
        }

        render json: { data: summary_data }
      end

      # GET /api/v1/organizations/:organization_id/events/unattributed
      def unattributed
        authorize! current_organization, to: :show?

        events = current_organization.tool_events.where(user_id: nil)
        events = apply_filters(events)
        events = events.includes(:project).order(occurred_at: :desc)

        render_collection(events, ToolEventSerializer)
      end

      # GET /api/v1/organizations/:organization_id/events/:id/audit_trail
      def audit_trail
        authorize! @event, to: :show?

        audit_log = @event.audit_logs.order(created_at: :desc).first

        if audit_log
          render_resource(audit_log, AuditLogSerializer)
        else
          render json: { data: nil, message: "No audit trail available for this event" }
        end
      end

      # GET /api/v1/organizations/:organization_id/events/export
      def export
        authorize! current_organization, to: :show?

        events = authorized_scope(current_organization.tool_events)
        events = apply_filters(events)

        # Role-based data scoping: members see only their own events
        unless current_user.global_admin? || current_user.admin_of?(current_organization)
          events = events.where(user_id: current_user.id)
        end

        events = events.includes(:user, :project).order(occurred_at: :desc)
        total_count = events.count

        if total_count > EXPORT_ROW_CAP
          role = export_role
          job_id = ToolEventExportJob.perform_async(
            export_filter_params.to_h,
            current_user.id,
            current_organization.id,
            role.to_s
          )
          response.set_header(
            "Link",
            "<#{api_v1_organization_event_export_job_url(current_organization, job_id)}>; rel=\"job_status\""
          )
          render json: { job_id: job_id, message: "Export queued" }, status: :accepted
          return
        end

        # No respond_to — ActionController::API does not include MimeResponds
        csv_data = ToolEventCsvExporter.generate(events.limit(EXPORT_ROW_CAP), export_role)
        send_data csv_data, filename: export_filename, type: "text/csv", disposition: "attachment"
      end

      private

      def set_event
        @event = current_organization.tool_events
                                     .includes(:user, :project, :audit_logs)
                                     .find(params[:id])
      end

      # Delegates to ToolEventFilterable using request params hash
      def apply_filters(scope)
        apply_tool_event_filters(scope, params.to_unsafe_h)
      end

      def apply_time_filter(scope)
        apply_tool_event_time_filter(scope, params.to_unsafe_h)
      end

      def export_role
        if current_user.global_admin?
          :global_admin
        elsif current_user.admin_of?(current_organization)
          :org_admin
        else
          :member
        end
      end

      def export_filename
        start_str = params[:start_date].presence || "all"
        end_str   = params[:end_date].presence || Date.current.iso8601
        "db90-events-#{start_str}-#{end_str}.csv"
      end

      def export_filter_params
        params.permit(:tool_name, :event_type, :user_id, :project_id,
                      :model, :start_date, :end_date, :risk_level)
      end
    end
  end
end

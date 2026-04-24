# frozen_string_literal: true

module Api
  module V1
    class EventsController < BaseController
      before_action :require_organization!
      before_action :set_event, only: %i[show audit_trail]

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

      private

      def set_event
        @event = current_organization.tool_events
                                     .includes(:user, :project, :audit_log)
                                     .find(params[:id])
      end

      def apply_filters(scope)
        scope = apply_time_filter(scope)
        scope = scope.where(tool_name: params[:tool_name]) if params[:tool_name].present?
        scope = scope.where(event_type: params[:event_type]) if params[:event_type].present?
        scope = scope.where(user_id: params[:user_id]) if params[:user_id].present?
        scope = scope.where(project_id: params[:project_id]) if params[:project_id].present?
        scope = scope.where(model: params[:model]) if params[:model].present?
        scope
      end

      def apply_time_filter(scope)
        if params[:start_date].present?
          scope = scope.where("occurred_at >= ?", Time.zone.parse(params[:start_date]))
        end
        if params[:end_date].present?
          scope = scope.where("occurred_at <= ?", Time.zone.parse(params[:end_date]))
        end
        scope
      end
    end
  end
end

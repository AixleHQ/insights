# frozen_string_literal: true

module Api
  module V1
    class OrganizationMembersController < BaseController
      before_action :require_organization!
      before_action :set_membership, only: %i[show update destroy stats events]

      # GET /api/v1/organizations/:organization_id/members
      def index
        memberships = current_organization.organization_memberships
                                          .includes(:user)
                                          .order('users.name')

        # Allow filtering by role
        memberships = memberships.where(role: params[:role]) if params[:role].present?

        render_collection(memberships, OrganizationMembershipSerializer)
      end

      # GET /api/v1/organizations/:organization_id/members/:id
      def show
        authorize! @membership
        render_resource(@membership, OrganizationMembershipSerializer)
      end

      # POST /api/v1/organizations/:organization_id/members
      def create
        @membership = current_organization.organization_memberships.new(membership_params)
        authorize! @membership

        if @membership.save
          render_created(@membership, OrganizationMembershipSerializer)
        else
          render json: {
            error: 'Unprocessable Entity',
            errors: format_validation_errors(@membership.errors)
          }, status: :unprocessable_entity
        end
      end

      # PATCH /api/v1/organizations/:organization_id/members/:id
      def update
        authorize! @membership

        if @membership.update(membership_update_params)
          render_resource(@membership, OrganizationMembershipSerializer)
        else
          render json: {
            error: 'Unprocessable Entity',
            errors: format_validation_errors(@membership.errors)
          }, status: :unprocessable_entity
        end
      end

      # DELETE /api/v1/organizations/:organization_id/members/:id
      def destroy
        authorize! @membership
        @membership.destroy!
        render_no_content
      end

      # GET /api/v1/organizations/:organization_id/members/:id/stats
      def stats
        authorize! @membership
        user = @membership.user

        events = current_organization.tool_events.where(user_id: user.id)

        total_events = events.count
        total_cost = events.sum(:cost_usd)
        events_today = events.where('created_at >= ?', Time.current.beginning_of_day).count
        events_this_week = events.where('created_at >= ?', 1.week.ago).count
        events_this_month = events.where('created_at >= ?', 1.month.ago).count

        # Tool breakdown
        tool_breakdown = events
          .group(:tool_name)
          .select('tool_name as tool, COUNT(*) as count, SUM(cost_usd) as cost')
          .order('count DESC')
          .map { |t| { tool: t.tool, count: t.count, cost: t.cost.to_f } }

        most_used_tool = tool_breakdown.first&.dig(:tool)

        # Daily activity for last 30 days
        daily_activity = events
          .where('created_at >= ?', 30.days.ago)
          .group('DATE(created_at)')
          .count
          .map { |date, count| { date: date.to_s, count: count } }
          .sort_by { |d| d[:date] }

        render json: {
          total_events: total_events,
          total_cost: total_cost.to_f,
          events_today: events_today,
          events_this_week: events_this_week,
          events_this_month: events_this_month,
          most_used_tool: most_used_tool,
          tool_breakdown: tool_breakdown,
          daily_activity: daily_activity
        }
      end

      # GET /api/v1/organizations/:organization_id/members/:id/events
      def events
        authorize! @membership
        user = @membership.user

        events = current_organization.tool_events
                                     .where(user_id: user.id)
                                     .includes(:user, :project)
                                     .order(created_at: :desc)

        # Pagination
        page = (params[:page] || 1).to_i
        per_page = [(params[:per_page] || 25).to_i, 100].min

        total = events.count
        events = events.offset((page - 1) * per_page).limit(per_page)

        render_collection(
          events,
          ToolEventSerializer,
          meta: {
            current_page: page,
            per_page: per_page,
            total_count: total,
            total_pages: (total.to_f / per_page).ceil
          }
        )
      end

      private

      def set_membership
        @membership = current_organization.organization_memberships.find(params[:id])
      end

      def membership_params
        params.permit(:user_id, :role)
      end

      def membership_update_params
        params.permit(:role)
      end
    end
  end
end

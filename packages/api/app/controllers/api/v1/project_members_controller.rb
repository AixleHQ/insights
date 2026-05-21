# frozen_string_literal: true

module Api
  module V1
    class ProjectMembersController < BaseController
      before_action :set_project
      before_action :set_membership, only: %i[show update destroy breakdown]

      # GET /api/v1/projects/:project_id/members/stats (collection — AIX-117 Members tab)
      def stats
        authorize! @project.project_memberships.new, to: :stats?

        days = (params[:days] || 30).to_i
        since = days.days.ago.beginning_of_day

        # Single scan: group by user+tool, aggregate in Ruby
        per_tool_rows = @project.tool_events
          .where(occurred_at: since..)
          .where.not(user_id: nil)
          .group(:user_id, :tool_name)
          .select(
            "user_id",
            "tool_name",
            "COUNT(*) AS tool_count",
            "COALESCE(SUM(tokens_in), 0) AS input_tokens",
            "COALESCE(SUM(tokens_out), 0) AS output_tokens",
            "COALESCE(SUM(cost_usd), 0) AS cost_usd",
            "MAX(occurred_at) AS last_event_at"
          )

        stats_by_user = {}
        primary_tools = {}

        per_tool_rows.each do |row|
          uid = row.user_id
          s = stats_by_user[uid] ||= {
            event_count: 0, input_tokens: 0, output_tokens: 0,
            cost_usd: 0.0, last_event_at: nil, max_tool_count: 0
          }
          count = row.tool_count.to_i
          s[:event_count]   += count
          s[:input_tokens]  += row.input_tokens.to_i
          s[:output_tokens] += row.output_tokens.to_i
          s[:cost_usd]      += row.cost_usd.to_f
          s[:last_event_at]  = [ s[:last_event_at], row.last_event_at ].compact.max
          if count > s[:max_tool_count]
            s[:max_tool_count] = count
            primary_tools[uid] = row.tool_name
          end
        end

        memberships = @project.project_memberships.includes(:user).order("users.name")

        data = memberships.filter_map do |m|
          next unless m.user

          s = stats_by_user[m.user_id]
          {
            userId:      m.user_id,
            email:       m.user.email,
            name:        m.user.name,
            role:        m.role,
            eventCount:  s&.dig(:event_count)  || 0,
            inputTokens: s&.dig(:input_tokens) || 0,
            outputTokens: s&.dig(:output_tokens) || 0,
            costUsd:     s&.dig(:cost_usd)     || 0.0,
            lastEventAt: s&.dig(:last_event_at)&.iso8601,
            primaryTool: primary_tools[m.user_id]
          }
        end

        render json: { data: data }
      end

      # GET /api/v1/projects/:project_id/members
      def index
        authorize! @project.project_memberships.new, to: :index?

        memberships = @project.project_memberships.includes(:user).order("users.name")

        # Allow filtering by role
        memberships = memberships.where(role: params[:role]) if params[:role].present?

        paginated = paginate(memberships)
        user_ids = paginated.map(&:user_id)

        user_stats =
          if user_ids.empty?
            {}
          else
            @project.tool_events
              .where(user_id: user_ids)
              .group(:user_id)
              .select(
                "user_id",
                "COALESCE(SUM(tokens_in), 0) + COALESCE(SUM(tokens_out), 0) as total_tokens",
                "COUNT(*) as total_events",
                "COALESCE(SUM(cost_usd), 0) as total_cost",
                "MAX(occurred_at) as last_active_at"
              )
              .index_by(&:user_id)
          end

        data = paginated.map do |membership|
          stats = user_stats[membership.user_id]
          ProjectMembershipSerializer.new(membership).serializable_hash.merge(
            total_tokens: stats&.total_tokens&.to_i || 0,
            total_events: stats&.total_events&.to_i || 0,
            total_cost:   stats&.total_cost&.to_f  || 0.0,
            last_active_at: stats&.last_active_at&.in_time_zone&.iso8601
          )
        end

        render json: { data: data, meta: pagination_meta(paginated) }, status: :ok
      end

      # GET /api/v1/projects/:project_id/members/:id
      def show
        authorize! @membership
        render_resource(@membership, ProjectMembershipSerializer)
      end

      # POST /api/v1/projects/:project_id/members
      def create
        @membership = @project.project_memberships.new(membership_params)
        authorize! @membership
        @membership.created_by = current_user

        if @membership.save
          ProjectAuditLog.log(
            project: @project,
            actor: current_user,
            action: "member.invited",
            resource: @membership,
            tracked_changes: { user_id: @membership.user_id, role: @membership.role },
            request: request
          )
          render_created(@membership, ProjectMembershipSerializer)
        else
          render json: {
            error: "Unprocessable Entity",
            errors: format_validation_errors(@membership.errors)
          }, status: :unprocessable_content
        end
      end

      # PATCH /api/v1/projects/:project_id/members/:id
      def update
        authorize! @membership

        old_role = @membership.role

        if @membership.update(membership_update_params)
          ProjectAuditLog.log(
            project: @project,
            actor: current_user,
            action: "member.role_changed",
            resource: @membership,
            tracked_changes: { user_id: @membership.user_id, before: old_role, after: @membership.role },
            request: request
          )
          render_resource(@membership, ProjectMembershipSerializer)
        else
          render json: {
            error: "Unprocessable Entity",
            errors: format_validation_errors(@membership.errors)
          }, status: :unprocessable_content
        end
      end

      # DELETE /api/v1/projects/:project_id/members/:id
      def destroy
        authorize! @membership

        user_id = @membership.user_id
        role = @membership.role

        if @membership.destroy
          ProjectAuditLog.log(
            project: @project,
            actor: current_user,
            action: "member.removed",
            resource: @membership,
            tracked_changes: { user_id: user_id, role: role },
            request: request
          )
          render_no_content
        else
          render json: {
            error: "Unprocessable Entity",
            errors: format_validation_errors(@membership.errors)
          }, status: :unprocessable_content
        end
      end

      # GET /api/v1/projects/:project_id/members/:id/breakdown
      def breakdown
        authorize! @membership, to: :stats?
        user = @membership.user

        events = @project.tool_events.where(user_id: user.id)

        total_events = events.count
        total_cost = events.sum(:cost_usd)
        events_today = events.where("occurred_at >= ?", Time.current.beginning_of_day).count
        events_this_week = events.where("occurred_at >= ?", 1.week.ago).count
        events_this_month = events.where("occurred_at >= ?", 1.month.ago).count

        total_tokens_in = events.sum(:tokens_in)
        total_tokens_out = events.sum(:tokens_out)
        total_tokens = events.sum(:tokens_total)

        tool_breakdown = events
          .group(:tool_name)
          .select(
            "tool_name as tool",
            "COUNT(*) as count",
            "SUM(cost_usd) as cost",
            "SUM(tokens_in) as tokens_in",
            "SUM(tokens_out) as tokens_out",
            "SUM(tokens_total) as tokens_total"
          )
          .order("count DESC")
          .map do |t|
            pricing = ModelPricingService.pricing_for_tool(t.tool)
            {
              tool: t.tool,
              count: t.count,
              cost: t.cost.to_f,
              tokens_in: t.tokens_in.to_i,
              tokens_out: t.tokens_out.to_i,
              tokens_total: t.tokens_total.to_i,
              price_per_million_input: pricing[:input],
              price_per_million_output: pricing[:output]
            }
          end

        most_used_tool = tool_breakdown.first&.dig(:tool)

        model_breakdown = events
          .where.not(model: [ nil, "" ])
          .group(:model)
          .select(
            "model",
            "COUNT(*) as count",
            "SUM(cost_usd) as cost",
            "SUM(tokens_in) as tokens_in",
            "SUM(tokens_out) as tokens_out",
            "SUM(tokens_total) as tokens_total"
          )
          .order("count DESC")
          .map do |m|
            pricing = ModelPricingService.pricing_for_model(m.model)
            {
              model: m.model,
              count: m.count,
              cost: m.cost.to_f,
              tokens_in: m.tokens_in.to_i,
              tokens_out: m.tokens_out.to_i,
              tokens_total: m.tokens_total.to_i,
              price_per_million_input: pricing[:input],
              price_per_million_output: pricing[:output]
            }
          end

        daily_activity = events
          .where("occurred_at >= ?", 30.days.ago)
          .group("DATE(occurred_at)")
          .select(
            "DATE(occurred_at) as date",
            "COUNT(*) as count",
            "SUM(tokens_total) as tokens"
          )
          .map { |d| { date: d.date.to_s, count: d.count, tokens: d.tokens.to_i } }
          .sort_by { |d| d[:date] }

        render json: {
          total_events: total_events,
          total_cost: total_cost.to_f,
          events_today: events_today,
          events_this_week: events_this_week,
          events_this_month: events_this_month,
          most_used_tool: most_used_tool,

          tokens: {
            total_in: total_tokens_in.to_i,
            total_out: total_tokens_out.to_i,
            total: total_tokens.to_i
          },

          tool_breakdown: tool_breakdown,
          model_breakdown: model_breakdown,
          daily_activity: daily_activity
        }
      end

      private

      def set_project
        @project = Project.find(params[:project_id])
      end

      def set_membership
        @membership = @project.project_memberships.includes(:user).where(id: params[:id]).or(
          @project.project_memberships.where(user_id: params[:id])
        ).first!
      end

      def membership_params
        params.permit(:user_id, :role) # brakeman:ignore:MassAssignment - role is validated against ROLES whitelist
      end

      def membership_update_params
        params.permit(:role) # brakeman:ignore:MassAssignment - role is validated against ROLES whitelist
      end
    end
  end
end

# frozen_string_literal: true

module Api
  module V1
    class OrganizationMembersController < BaseController
      include TimezoneBucketing

      before_action :require_organization!
      before_action :set_membership, only: %i[show update destroy stats events dashboard_stats member_heatmap prompt_insights]

      PROMPT_DIMENSION_TEXT = {
        strength: {
          structure:   "Well-formed, detailed prompts",
          context:     "Good context variety across event types",
          specificity: "Focused, concise requests"
        },
        opportunity: {
          structure:   "Add more structure to your prompts",
          context:     "Vary your usage across event types",
          specificity: "Try more targeted requests"
        }
      }.freeze

      # GET /api/v1/organizations/:organization_id/members
      def index
        authorize! current_organization, to: :show?

        memberships = current_organization.organization_memberships
                                          .includes(:user)
                                          .order("users.name")

        # Allow filtering by role
        memberships = memberships.where(role: params[:role]) if params[:role].present?

        # Get usage stats for all users in this org in a single query
        user_ids = memberships.map { |m| m.user_id }

        user_stats = current_organization.tool_events
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

        cli_connected_user_ids = MemberCliConnectionQuery.connected_user_ids(
          organization_id: current_organization.id,
          user_ids: user_ids
        )

        # Build response with stats
        data = memberships.map do |membership|
          stats = user_stats[membership.user_id]
          OrganizationMembershipSerializer.new(membership).serializable_hash.merge(
            total_tokens: stats&.total_tokens&.to_i || 0,
            total_events: stats&.total_events&.to_i || 0,
            total_cost:   stats&.total_cost&.to_f  || 0.0,
            last_active_at: stats&.last_active_at&.in_time_zone&.iso8601,
            cli_connected: cli_connected_user_ids.include?(membership.user_id)
          )
        end

        render json: { data: data }
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
          OrganizationAuditLog.log(
            organization: current_organization,
            actor: current_user,
            action: "member.invited",
            resource: @membership,
            tracked_changes: { user_id: @membership.user_id, role: @membership.role },
            request: request
          )
          render_created(@membership, OrganizationMembershipSerializer)
        else
          render json: {
            error: "Unprocessable Entity",
            errors: format_validation_errors(@membership.errors)
          }, status: :unprocessable_content
        end
      end

      # PATCH /api/v1/organizations/:organization_id/members/:id
      def update
        authorize! @membership

        old_role = @membership.role

        if @membership.update(membership_update_params)
          OrganizationAuditLog.log(
            organization: current_organization,
            actor: current_user,
            action: "member.role_changed",
            resource: @membership,
            tracked_changes: { user_id: @membership.user_id, before: old_role, after: @membership.role },
            request: request
          )
          render_resource(@membership, OrganizationMembershipSerializer)
        else
          render json: {
            error: "Unprocessable Entity",
            errors: format_validation_errors(@membership.errors)
          }, status: :unprocessable_content
        end
      end

      # DELETE /api/v1/organizations/:organization_id/members/:id
      def destroy
        authorize! @membership

        user_id = @membership.user_id
        role = @membership.role

        if @membership.destroy
          OrganizationAuditLog.log(
            organization: current_organization,
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

      # GET /api/v1/organizations/:organization_id/members/:id/stats
      def stats
        authorize! @membership
        user = @membership.user

        all_events = current_organization.tool_events.where(user_id: user.id)

        # Range-scoped events drive every metric and breakdown below. ?all_time=true
        # removes the bound; ?days=N is a rolling window (default 30). The "today /
        # this week / this month" cards are fixed windows independent of the range.
        range_start = member_stats_range_start
        events = range_start ? all_events.where("occurred_at >= ?", range_start) : all_events

        # Basic counts
        total_events = events.count
        total_cost = events.sum(:cost_usd)
        events_today = all_events.where("occurred_at >= ?", client_zone.now.beginning_of_day).count
        events_this_week = all_events.where("occurred_at >= ?", 1.week.ago).count
        events_this_month = all_events.where("occurred_at >= ?", 1.month.ago).count

        # Token totals
        total_tokens_in = events.sum(:tokens_in)
        total_tokens_out = events.sum(:tokens_out)
        total_tokens = events.sum(:tokens_total)

        # Tool breakdown with tokens
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

        # Model breakdown with pricing
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

        # Daily activity for the selected range (drives the activity heatmap).
        daily_activity = events
          .group(date_sql)
          .select(
            "#{date_sql} as date",
            "COUNT(*) as count",
            "SUM(tokens_total) as tokens"
          )
          .map { |d| { date: d.date.to_s, count: d.count, tokens: d.tokens.to_i } }
          .sort_by { |d| d[:date] }

        # Projects this user is on (in this organization)
        projects = current_organization.projects
          .joins(:project_memberships)
          .where(project_memberships: { user_id: user.id })
          .select(:id, :name, :slug)
          .map { |p| { id: p.id, name: p.name, slug: p.slug } }

        # Also include projects with events even if not explicitly a member.
        # Uses full history so short ranges don't hide a member's projects.
        project_ids_from_events = all_events.where.not(project_id: nil).distinct.pluck(:project_id)
        projects_from_events = current_organization.projects
          .where(id: project_ids_from_events)
          .where.not(id: projects.map { |p| p[:id] })
          .select(:id, :name, :slug)
          .map { |p| { id: p.id, name: p.name, slug: p.slug, from_events: true } }

        all_projects = projects + projects_from_events

        # Organizations this user belongs to
        organizations = user.organization_memberships
          .includes(:organization)
          .map do |m|
            {
              id: m.organization.id,
              name: m.organization.name,
              slug: m.organization.slug,
              role: m.role,
              is_current: m.organization_id == current_organization.id
            }
          end

        # Tool accounts the user has connected (in this organization)
        tool_accounts = @membership.user_tool_accounts.map do |ta|
          {
            id: ta.id,
            tool_name: ta.tool_name,
            external_username: ta.external_username,
            connection_state: ta.connection_state
          }
        end

        render json: {
          # Basic stats
          total_events: total_events,
          total_cost: total_cost.to_f,
          events_today: events_today,
          events_this_week: events_this_week,
          events_this_month: events_this_month,
          most_used_tool: most_used_tool,

          # Token metrics
          tokens: {
            total_in: total_tokens_in.to_i,
            total_out: total_tokens_out.to_i,
            total: total_tokens.to_i
          },

          # Breakdowns
          tool_breakdown: tool_breakdown,
          model_breakdown: model_breakdown,
          daily_activity: daily_activity,

          # Related entities
          projects: all_projects,
          organizations: organizations,
          tool_accounts: tool_accounts
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
        per_page = [ (params[:per_page] || 25).to_i, 100 ].min

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

      # GET /api/v1/organizations/:organization_id/members/:id/dashboard_stats
      def dashboard_stats
        authorize! @membership

        days = period_days(params[:period])

        current_start = (client_zone.now - days.days).beginning_of_day
        prev_start    = (client_zone.now - (days * 2).days).beginning_of_day
        quoted        = ActiveRecord::Base.connection.quote(current_start)

        # Single aggregate query covering both windows using PostgreSQL FILTER.
        # Uses >= / < boundary so the windows are non-overlapping (fixes the
        # original double-counting bug on the boundary day).
        base = current_organization.tool_events
          .where(user_id: @membership.user_id, occurred_at: prev_start..Time.current)

        agg = base.select(Arel.sql(<<~SQL.squish)).take
          COUNT(*) FILTER (WHERE occurred_at >= #{quoted}) AS curr_events,
          COUNT(*) FILTER (WHERE occurred_at <  #{quoted}) AS prev_events,
          COALESCE(SUM(cost_usd)   FILTER (WHERE occurred_at >= #{quoted}), 0) AS curr_cost,
          COALESCE(SUM(cost_usd)   FILTER (WHERE occurred_at <  #{quoted}), 0) AS prev_cost,
          COALESCE(SUM(tokens_in)  FILTER (WHERE occurred_at >= #{quoted}), 0) AS curr_in,
          COALESCE(SUM(tokens_in)  FILTER (WHERE occurred_at <  #{quoted}), 0) AS prev_in,
          COALESCE(SUM(tokens_out) FILTER (WHERE occurred_at >= #{quoted}), 0) AS curr_out,
          COALESCE(SUM(tokens_out) FILTER (WHERE occurred_at <  #{quoted}), 0) AS prev_out
        SQL

        curr_events = agg.curr_events.to_i
        prev_events = agg.prev_events.to_i
        curr_cost   = agg.curr_cost.to_f
        prev_cost   = agg.prev_cost.to_f
        curr_in     = agg.curr_in.to_i
        prev_in     = agg.prev_in.to_i
        curr_out    = agg.curr_out.to_i
        prev_out    = agg.prev_out.to_i
        curr_tokens = curr_in + curr_out
        prev_tokens = prev_in + prev_out

        events_change = prev_events > 0 ? ((curr_events - prev_events).to_f / prev_events * 100).round(1) : 0
        cost_change   = prev_cost   > 0 ? ((curr_cost   - prev_cost).to_f   / prev_cost   * 100).round(1) : 0
        tokens_change = prev_tokens > 0 ? ((curr_tokens - prev_tokens).to_f / prev_tokens * 100).round(1) : 0

        tool_breakdown = base
          .where(occurred_at: current_start..Time.current)
          .group(:tool_name)
          .select("tool_name, COUNT(*) as event_count, COALESCE(SUM(cost_usd), 0) as cost_usd")
          .order("event_count DESC")
          .map { |t| { tool_name: t.tool_name, event_count: t.event_count.to_i, cost_usd: t.cost_usd.to_f } }

        render json: {
          total_events:          curr_events,
          total_cost_usd:        curr_cost,
          total_tokens_in:       curr_in,
          total_tokens_out:      curr_out,
          events_change_percent: events_change,
          cost_change_percent:   cost_change,
          tokens_change_percent: tokens_change,
          tool_breakdown:        tool_breakdown
        }
      end

      # GET /api/v1/organizations/:organization_id/members/:id/prompt_insights?period=30d
      def prompt_insights
        authorize! @membership

        # Heuristic stub for AIX-120; replace with real LLM/Temporal scoring in follow-up ticket.
        # When doing so, extract scoring logic to app/services/prompt_quality_scorer.rb.
        # Structure is inflated by IDE-injected file context (system prompts, file reads) — user
        # prompt quality alone is not measurable from token counts. Document in follow-up scope.
        days = period_days(params[:period])

        current_start = (client_zone.now - days.days).beginning_of_day
        events = current_organization.tool_events
          .where(user_id: @membership.user_id, occurred_at: current_start..Time.current)

        # Aggregate with no GROUP BY always returns one row (COUNT(*) = 0 when empty) — agg is never nil.
        agg = events.select(Arel.sql(<<~SQL.squish)).take
          COUNT(*)                                   AS total_count,
          COALESCE(SUM(tokens_in), 0)                AS total_tokens_in,
          COALESCE(SUM(tokens_out), 0)               AS total_tokens_out,
          COUNT(DISTINCT event_type)                 AS distinct_event_types
        SQL

        return render json: {
          score: 0,
          dimensions: { structure: 0, context: 0, specificity: 0 },
          callouts: []
        } if agg.total_count.to_i == 0

        avg_tokens_in = agg.total_tokens_in.to_f / agg.total_count.to_i

        structure    = ([ [ avg_tokens_in / 200.0, 0 ].max, 1 ].min * 10).round(1)
        context      = ([ [ agg.distinct_event_types.to_f / 5.0, 0 ].max, 1 ].min * 10).round(1)
        tokens_in    = agg.total_tokens_in.to_i
        tokens_out   = agg.total_tokens_out.to_i
        specificity  = ([ [ tokens_out.to_f / [ tokens_in, 1 ].max, 0 ].max, 1 ].min * 10).round(1)

        score = ((structure + context + specificity) / 3.0).round(1)

        dimensions = [
          [ :structure,   structure   ],
          [ :context,     context     ],
          [ :specificity, specificity ]
        ]

        top_strength    = dimensions.max_by { |_, v| v }.first
        biggest_opp     = dimensions.min_by { |_, v| v }.first

        best_tool_row = events
          .group(:tool_name)
          .select("tool_name, COUNT(*) as event_count")
          .order("event_count DESC")
          .first

        callouts = [
          {
            type:  "strength",
            label: "Top Strength",
            text:  "#{top_strength.to_s.capitalize}: #{PROMPT_DIMENSION_TEXT[:strength][top_strength]}"
          },
          {
            type:  "tool",
            label: "Best Tool",
            text:  best_tool_row ? "#{best_tool_row.tool_name} · #{best_tool_row.event_count} events" : "No tool data"
          },
          {
            type:  "opportunity",
            label: "Biggest Opportunity",
            text:  "#{biggest_opp.to_s.capitalize}: #{PROMPT_DIMENSION_TEXT[:opportunity][biggest_opp]}"
          }
        ]

        render json: {
          score:      score,
          dimensions: { structure: structure, context: context, specificity: specificity },
          callouts:   callouts
        }
      end

      # GET /api/v1/organizations/:organization_id/members/:id/stats/heatmap
      def member_heatmap
        authorize! @membership

        data = current_organization.tool_events
          .where(user_id: @membership.user_id, occurred_at: 1.year.ago..Time.current)
          .group(date_sql)
          .select("#{date_sql} as date, COUNT(*) as count")
          .order("date ASC")
          .map { |r| { date: r.date.to_s, count: r.count.to_i } }

        render json: data
      end

      private

      # Resolves the start of the member-stats window. Returns nil for ?all_time=true
      # (no lower bound), otherwise a rolling window of ?days=N (default 30, clamped
      # 1..730) anchored to the start of the day in the client's timezone.
      def member_stats_range_start
        return nil if ActiveModel::Type::Boolean.new.cast(params[:all_time])

        days = (params[:days] || 30).to_i.clamp(1, 730)
        client_zone.now.beginning_of_day - (days - 1).days
      end

      def period_days(period)
        case period
        when "7d"  then 7
        when "90d" then 90
        else 30
        end
      end

      def set_membership
        @membership = current_organization.organization_memberships
          .where(id: params[:id]).or(
            current_organization.organization_memberships.where(user_id: params[:id])
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

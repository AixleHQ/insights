# frozen_string_literal: true

module Api
  module V1
    class OrganizationMembersController < BaseController
      before_action :require_organization!
      before_action :set_membership, only: %i[show update destroy stats events]

      # GET /api/v1/organizations/:organization_id/members
      def index
        authorize! current_organization, to: :show?

        memberships = current_organization.organization_memberships
                                          .includes(:user)
                                          .order("users.name")

        # Allow filtering by role
        memberships = memberships.where(role: params[:role]) if params[:role].present?

        # Get token usage stats for all users in this org
        user_ids = memberships.map { |m| m.user_id }

        token_stats = current_organization.tool_events
          .where(user_id: user_ids)
          .group(:user_id)
          .select(
            "user_id",
            "COALESCE(SUM(tokens_in), 0) + COALESCE(SUM(tokens_out), 0) as total_tokens"
          )
          .index_by(&:user_id)

        # Build response with stats
        data = memberships.map do |membership|
          stats = token_stats[membership.user_id]
          OrganizationMembershipSerializer.new(membership).serializable_hash.merge(
            total_tokens: stats&.total_tokens&.to_i || 0,
            last_active_at: membership.user.last_login_at&.iso8601
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
          }, status: :unprocessable_entity
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
          }, status: :unprocessable_entity
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
          }, status: :unprocessable_entity
        end
      end

      # GET /api/v1/organizations/:organization_id/members/:id/stats
      def stats
        authorize! @membership
        user = @membership.user

        Rails.logger.info "[MemberStats] User: #{user.id}/#{user.email}, Org: #{current_organization.id}/#{current_organization.slug}"
        Rails.logger.info "[MemberStats] All events for user: #{ToolEvent.where(user_id: user.id).count}"
        Rails.logger.info "[MemberStats] Events in org: #{current_organization.tool_events.where(user_id: user.id).count}"

        events = current_organization.tool_events.where(user_id: user.id)

        # Basic counts
        total_events = events.count
        total_cost = events.sum(:cost_usd)
        events_today = events.where("occurred_at >= ?", Time.current.beginning_of_day).count
        events_this_week = events.where("occurred_at >= ?", 1.week.ago).count
        events_this_month = events.where("occurred_at >= ?", 1.month.ago).count

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

        # Daily activity for last 30 days
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

        # Projects this user is on (in this organization)
        projects = current_organization.projects
          .joins(:project_memberships)
          .where(project_memberships: { user_id: user.id })
          .select(:id, :name, :slug)
          .map { |p| { id: p.id, name: p.name, slug: p.slug } }

        # Also include projects with events even if not explicitly a member
        project_ids_from_events = events.where.not(project_id: nil).distinct.pluck(:project_id)
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
            is_active: ta.is_active
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

      private

      def set_membership
        @membership = current_organization.organization_memberships.find(params[:id])
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

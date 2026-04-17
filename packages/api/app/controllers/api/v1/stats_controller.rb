# frozen_string_literal: true

module Api
  module V1
    class StatsController < BaseController
      TOOL_SCOPED_ACTIONS = %i[tool_overview tool_models tool_users tool_daily tool_event_types].freeze

      before_action :require_organization!
      before_action :set_tool_scope, only: TOOL_SCOPED_ACTIONS

      # GET /api/v1/organizations/:organization_id/stats/overview
      # Frontend expects: { total_events, total_cost_usd, high_risk_events, active_users, events_change_percent, cost_change_percent }
      def overview
        authorize! current_organization, to: :show?

        # Current period (this month)
        current_start = Time.current.beginning_of_month
        current_end = Time.current
        current_events = current_organization.tool_events.where(occurred_at: current_start..current_end)

        # Previous period (last month) for comparison
        prev_start = 1.month.ago.beginning_of_month
        prev_end = 1.month.ago.end_of_month
        prev_events = current_organization.tool_events.where(occurred_at: prev_start..prev_end)

        # Last 7 days for active users
        week_ago = 7.days.ago
        active_users = current_organization.tool_events.where("occurred_at > ?", week_ago).distinct.count(:user_id)

        # High risk events (from audit logs)
        high_risk_count = AuditLog
          .joins(:tool_event)
          .where(tool_events: { organization_id: current_organization.id })
          .where(risk_level: %w[high critical])
          .count

        # Calculate change percentages
        current_count = current_events.count
        prev_count = prev_events.count
        events_change = prev_count > 0 ? ((current_count - prev_count).to_f / prev_count * 100) : 0

        current_cost = current_events.sum(:cost_usd).to_f
        prev_cost = prev_events.sum(:cost_usd).to_f
        cost_change = prev_cost > 0 ? ((current_cost - prev_cost) / prev_cost * 100) : 0

        render json: {
          total_events: current_count,
          total_cost_usd: current_cost,
          high_risk_events: high_risk_count,
          active_users: active_users,
          events_change_percent: events_change.round(1),
          cost_change_percent: cost_change.round(1)
        }
      end

      # GET /api/v1/organizations/:organization_id/stats/hourly
      def hourly
        authorize! current_organization, to: :show?

        time_range = parse_time_range(default_hours: 24)
        events = current_organization.tool_events
                                     .where(occurred_at: time_range[:start]..time_range[:end])

        hourly_data = events
          .group("DATE_TRUNC('hour', occurred_at)")
          .select(
            "DATE_TRUNC('hour', occurred_at) as hour",
            "COUNT(*) as event_count",
            "SUM(tokens_in) as tokens_in",
            "SUM(tokens_out) as tokens_out",
            "SUM(cost_usd) as cost_usd",
            "COUNT(DISTINCT user_id) as unique_users"
          )
          .order("hour")
          .map do |row|
            {
              hour: row.hour&.iso8601,
              eventCount: row.event_count,
              tokensIn: row.tokens_in || 0,
              tokensOut: row.tokens_out || 0,
              costUsd: (row.cost_usd || 0).to_f,
              uniqueUsers: row.unique_users
            }
          end

        render json: {
          data: {
            timeRange: {
              start: time_range[:start].iso8601,
              end: time_range[:end].iso8601
            },
            hourly: hourly_data
          }
        }
      end

      # GET /api/v1/organizations/:organization_id/stats/daily
      # Frontend expects: { data: DailyStats[], tool_breakdown: ToolUsageStats[] }
      def daily
        authorize! current_organization, to: :show?

        days = (params[:days] || 30).to_i
        time_range = parse_time_range(default_days: days)
        events = current_organization.tool_events
                                     .where(occurred_at: time_range[:start]..time_range[:end])

        daily_data = events
          .group("DATE_TRUNC('day', occurred_at)")
          .select(
            "DATE_TRUNC('day', occurred_at) as day",
            "COUNT(*) as event_count",
            "SUM(cost_usd) as cost_usd"
          )
          .order("day")
          .map do |row|
            {
              date: row.day&.to_date&.iso8601,
              event_count: row.event_count,
              cost_usd: (row.cost_usd || 0).to_f
            }
          end

        tool_breakdown = events
          .group(:tool_name)
          .select(
            "tool_name",
            "COUNT(*) as event_count",
            "SUM(cost_usd) as cost_usd"
          )
          .order(Arel.sql("event_count DESC"))
          .map do |row|
            {
              tool_name: row.tool_name,
              event_count: row.event_count,
              cost_usd: (row.cost_usd || 0).to_f
            }
          end

        render json: {
          data: daily_data,
          tool_breakdown: tool_breakdown
        }
      end

      # GET /api/v1/organizations/:organization_id/stats/daily_by_tool
      # Returns daily event counts grouped by tool for stacked bar chart
      def daily_by_tool
        authorize! current_organization, to: :show?

        days = (params[:days] || 30).to_i
        time_range = parse_time_range(default_days: days)
        events = current_organization.tool_events
                                     .where(occurred_at: time_range[:start]..time_range[:end])

        # Get top tools by total event count
        top_tools = events
          .group(:tool_name)
          .order(Arel.sql("COUNT(*) DESC"))
          .limit(3)
          .pluck(:tool_name)

        # Get daily data grouped by date and tool
        daily_tool_data = events
          .group("DATE_TRUNC('day', occurred_at)", :tool_name)
          .select(
            "DATE_TRUNC('day', occurred_at) as day",
            "tool_name",
            "COUNT(*) as event_count"
          )
          .order("day")

        # Transform into chart-friendly format
        # Group by date, with each date having counts for top tools + "Other"
        date_map = {}
        daily_tool_data.each do |row|
          date = row.day&.to_date&.iso8601
          next unless date

          date_map[date] ||= { date: date }
          tool_key = top_tools.include?(row.tool_name) ? row.tool_name : "Other"
          date_map[date][tool_key] ||= 0
          date_map[date][tool_key] += row.event_count
        end

        render json: {
          data: date_map.values.sort_by { |d| d[:date] },
          tools: top_tools + [ "Other" ]
        }
      end

      # GET /api/v1/organizations/:organization_id/stats/heatmap
      # Returns activity data for the past year for heatmap visualization
      def heatmap
        authorize! current_organization, to: :show?

        # Get past year of data
        start_date = 1.year.ago.beginning_of_day
        end_date = Time.current

        daily_counts = current_organization.tool_events
          .where(occurred_at: start_date..end_date)
          .group("DATE(occurred_at)")
          .count

        # Convert to array format expected by frontend
        heatmap_data = daily_counts.map do |date, count|
          {
            date: date.to_s,
            count: count
          }
        end

        render json: heatmap_data
      end

      # GET /api/v1/organizations/:organization_id/stats/tools/:tool_name/overview
      def tool_overview
        authorize! current_organization, to: :show?

        current_start = Time.current.beginning_of_month
        prev_start    = 1.month.ago.beginning_of_month
        prev_end      = 1.month.ago.end_of_month

        current = @tool_events.where(occurred_at: current_start..Time.current)
        prev    = @tool_events.where(occurred_at: prev_start..prev_end)

        current_count = current.count
        prev_count    = prev.count
        current_cost  = current.sum(:cost_usd).to_f
        prev_cost     = prev.sum(:cost_usd).to_f

        render json: {
          tool:              @tool_name,
          total_events:      current_count,
          total_cost_usd:    current_cost,
          total_tokens_in:   current.sum(:tokens_in).to_i,
          total_tokens_out:  current.sum(:tokens_out).to_i,
          active_users:      current.where.not(user_id: nil).distinct.count(:user_id),
          events_change_pct: prev_count > 0 ? ((current_count - prev_count).to_f / prev_count * 100).round(1) : 0,
          cost_change_pct:   prev_cost  > 0 ? ((current_cost  - prev_cost).to_f / prev_cost  * 100).round(1) : 0
        }
      end

      # GET /api/v1/organizations/:organization_id/stats/tools/:tool_name/models
      def tool_models
        authorize! current_organization, to: :show?
        head :ok
      end

      # GET /api/v1/organizations/:organization_id/stats/tools/:tool_name/users
      def tool_users
        authorize! current_organization, to: :show?
        head :ok
      end

      # GET /api/v1/organizations/:organization_id/stats/tools/:tool_name/daily
      def tool_daily
        authorize! current_organization, to: :show?
        head :ok
      end

      # GET /api/v1/organizations/:organization_id/stats/tools/:tool_name/event_types
      def tool_event_types
        authorize! current_organization, to: :show?
        head :ok
      end

      private

      def set_tool_scope
        tool = params[:tool_name]
        unless ToolEvent::TOOL_NAMES.include?(tool)
          return render json: { error: "Unknown tool: #{tool}" }, status: :unprocessable_entity
        end

        @tool_name = tool
        # @tool_events is intentionally unbounded — always scope by time range before querying.
        # Use: @tool_events.where(occurred_at: time_range[:start]..time_range[:end])
        @tool_events = current_organization.tool_events.where(tool_name: tool)
      end

      def parse_time_range(default_days: 7, default_hours: nil)
        if params[:start_date].present? && params[:end_date].present?
          {
            start: Time.zone.parse(params[:start_date]).beginning_of_day,
            end: Time.zone.parse(params[:end_date]).end_of_day
          }
        elsif default_hours
          {
            start: default_hours.hours.ago,
            end: Time.current
          }
        else
          {
            start: default_days.days.ago.beginning_of_day,
            end: Time.current
          }
        end
      end

      def aggregate_by_column(events, column)
        events
          .where.not(column => nil)
          .group(column)
          .select(
            "#{column}",
            "COUNT(*) as event_count",
            "SUM(tokens_in) as tokens_in",
            "SUM(tokens_out) as tokens_out",
            "SUM(cost_usd) as cost_usd"
          )
          .order(Arel.sql("event_count DESC"))
          .limit(20)
          .map do |row|
            {
              name: row.public_send(column),
              eventCount: row.event_count,
              tokensIn: row.tokens_in || 0,
              tokensOut: row.tokens_out || 0,
              costUsd: (row.cost_usd || 0).to_f
            }
          end
      end

      def top_users(events, limit)
        events
          .where.not(user_id: nil)
          .group(:user_id)
          .select(
            "user_id",
            "COUNT(*) as event_count",
            "SUM(tokens_in + tokens_out) as total_tokens",
            "SUM(cost_usd) as cost_usd"
          )
          .order(Arel.sql("total_tokens DESC"))
          .limit(limit)
          .map do |row|
            user = User.find_by(id: row.user_id)
            {
              userId: row.user_id,
              name: user&.name || "Unknown",
              email: user&.email,
              eventCount: row.event_count,
              totalTokens: row.total_tokens || 0,
              costUsd: (row.cost_usd || 0).to_f
            }
          end
      end

      def risk_summary(time_range)
        audit_logs = AuditLog
          .joins(:tool_event)
          .where(tool_events: { organization_id: current_organization.id })
          .where(tool_events: { occurred_at: time_range[:start]..time_range[:end] })

        {
          total: audit_logs.count,
          byRiskLevel: audit_logs.group(:risk_level).count,
          highRiskCount: audit_logs.where(risk_level: %w[high critical]).count
        }
      end
    end
  end
end

# frozen_string_literal: true

module Api
  module V1
    class StatsController < BaseController
      TOOL_SCOPED_ACTIONS = %i[tool_overview tool_models tool_users tool_daily tool_event_types].freeze
      ALLOWED_PERIODS = %w[day week month].freeze

      before_action :require_organization!
      before_action :set_tool_scope, only: TOOL_SCOPED_ACTIONS

      # GET /api/v1/organizations/:organization_id/stats/overview
      # Optional param: project_id — scopes all counts to that project
      def overview
        authorize! current_organization, to: :show?

        base_scope = if params[:project_id].present?
          current_organization.projects.find(params[:project_id]).tool_events
        else
          current_organization.tool_events
        end

        current_start  = Time.current.beginning_of_month
        current_end    = Time.current
        current_events = base_scope.where(occurred_at: current_start..current_end)

        prev_start  = 1.month.ago.beginning_of_month
        prev_end    = 1.month.ago.end_of_month
        prev_events = base_scope.where(occurred_at: prev_start..prev_end)

        # Counts users with at least one event in the last 7 days — intentionally activity-based,
        # not membership-based. A newly-added member with no events will not appear here until
        # they start generating activity.
        active_users = base_scope.where("occurred_at > ?", 7.days.ago).distinct.count(:user_id)

        # Count distinct tool_events that have at least one non-none audit log in the current month.
        # Distinct avoids inflation when one event has multiple audit_log rows.
        high_risk_count = AuditLog
          .joins(:tool_event)
          .where(tool_events: { id: current_events.select(:id) })
          .where.not(risk_level: "none")
          .select(:tool_event_id)
          .distinct
          .count

        current_count = current_events.count
        prev_count    = prev_events.count
        events_change = prev_count > 0 ? ((current_count - prev_count).to_f / prev_count * 100) : 0

        current_cost = current_events.sum(:cost_usd).to_f
        prev_cost    = prev_events.sum(:cost_usd).to_f
        cost_change  = prev_cost > 0 ? ((current_cost - prev_cost) / prev_cost * 100) : 0

        render json: {
          total_events:          current_count,
          total_cost_usd:        current_cost,
          risk_alerts:           high_risk_count,
          active_users:          active_users,
          events_change_percent: events_change.round(1),
          cost_change_percent:   cost_change.round(1)
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

        rows_by_date = events
          .group("DATE_TRUNC('day', occurred_at)")
          .select(
            "DATE_TRUNC('day', occurred_at) as day",
            "COUNT(*) as event_count",
            "SUM(cost_usd) as cost_usd"
          )
          .order("day")
          .each_with_object({}) do |row, h|
            h[row.day.to_date.iso8601] = {
              date: row.day.to_date.iso8601,
              event_count: row.event_count,
              cost_usd: (row.cost_usd || 0).to_f
            }
          end

        # Zero-fill every calendar day in the range so the chart always shows
        # the correct window (e.g. "7 days" = last 7 calendar days, not last 7 active days).
        daily_data = (time_range[:start].to_date..time_range[:end].to_date).map do |date|
          rows_by_date[date.iso8601] || { date: date.iso8601, event_count: 0, cost_usd: 0.0 }
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
      # Optional params: period (day|week), month (YYYY-MM), project_id
      def daily_by_tool
        authorize! current_organization, to: :show?

        time_range = month_or_days_time_range
        trunc      = params[:period] == "week" ? "week" : "day"
        events     = scoped_events(time_range)

        top_tools = events
          .group(:tool_name)
          .order(Arel.sql("COUNT(*) DESC"))
          .limit(3)
          .pluck(:tool_name)

        daily_tool_data = events
          .group("DATE_TRUNC('#{trunc}', occurred_at)", :tool_name)
          .select(
            "DATE_TRUNC('#{trunc}', occurred_at) as bucket",
            "tool_name",
            "COUNT(*) as event_count"
          )
          .order("bucket")

        date_map = {}
        daily_tool_data.each do |row|
          date = row.bucket&.to_date&.iso8601
          next unless date

          date_map[date] ||= { date: date }
          tool_key = top_tools.include?(row.tool_name) ? row.tool_name : "Other"
          date_map[date][tool_key] = (date_map[date][tool_key] || 0) + row.event_count
        end

        render json: {
          data:  date_map.values.sort_by { |d| d[:date] },
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

      # GET /api/v1/organizations/:organization_id/stats/risk_alerts
      # Returns tool-grouped events that have >=1 non-none audit log.
      # Subquery form prevents SUM inflation from the ToolEvent has_many :audit_logs relation.
      def risk_alerts
        authorize! current_organization, to: :show?

        time_range = month_or_days_time_range

        risky_ids = scoped_events(time_range)
          .joins("INNER JOIN audit_logs ON audit_logs.tool_event_id = tool_events.id")
          .where.not("audit_logs.risk_level": "none")
          .select("tool_events.id")
          .distinct

        rows = ToolEvent.where(id: risky_ids)
          .group(:tool_name)
          .select(
            "tool_name",
            "COUNT(*) AS event_count",
            "SUM(tokens_in)  AS tokens_in",
            "SUM(tokens_out) AS tokens_out",
            "SUM(cost_usd)   AS cost_usd"
          )
          .order(Arel.sql("COUNT(*) DESC"))

        render json: rows.map { |r|
          {
            toolName:   r.tool_name,
            eventCount: r.event_count,
            tokensIn:   r.tokens_in.to_i,
            tokensOut:  r.tokens_out.to_i,
            costUsd:    r.cost_usd.to_f
          }
        }
      end

      # GET /api/v1/organizations/:organization_id/stats/daily_by_model
      # Optional params: period (day|week), month (YYYY-MM), project_id
      def daily_by_model
        authorize! current_organization, to: :show?

        time_range = month_or_days_time_range
        trunc      = params[:period] == "week" ? "week" : "day"
        events     = scoped_events(time_range)

        top_models = events
          .where.not(model: [ nil, "" ])
          .group(:model)
          .order(Arel.sql("COUNT(*) DESC"))
          .limit(3)
          .pluck(:model)

        data = events
          .where.not(model: [ nil, "" ])
          .group("DATE_TRUNC('#{trunc}', occurred_at)", :model)
          .select(
            "DATE_TRUNC('#{trunc}', occurred_at) as bucket",
            "model",
            "COUNT(*) as event_count"
          )
          .order("bucket")

        date_map = {}
        data.each do |row|
          date = row.bucket&.to_date&.iso8601
          next unless date

          date_map[date] ||= { date: date }
          key = top_models.include?(row.model) ? row.model : "Other"
          date_map[date][key] = (date_map[date][key] || 0) + row.event_count
        end

        render json: {
          data:   date_map.values.sort_by { |d| d[:date] },
          models: top_models + [ "Other" ]
        }
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

        time_range = parse_time_range(default_days: (params[:days] || 30).to_i)
        events = @tool_events.where(occurred_at: time_range[:start]..time_range[:end])

        models = aggregate_by_column(events, :model).map do |row|
          pricing = ModelPricingService.pricing_for_model(row[:name])
          provider_slug, routed_model = split_model_key(row[:name])

          row.merge(
            provider: provider_slug,
            model: routed_model,
            displayName: display_name_for_model(row[:name], provider_slug, routed_model),
            price_per_million_input: pricing&.dig(:input),
            price_per_million_output: pricing&.dig(:output)
          )
        end

        render json: {
          tool: @tool_name,
          timeRange: { start: time_range[:start].iso8601, end: time_range[:end].iso8601 },
          models: models
        }
      end

      # GET /api/v1/organizations/:organization_id/stats/tools/:tool_name/users
      def tool_users
        authorize! current_organization, to: :show?

        time_range = parse_time_range(default_days: (params[:days] || 30).to_i)
        events = @tool_events.where(occurred_at: time_range[:start]..time_range[:end])
        limit = (params[:limit] || 20).to_i.clamp(1, 100)

        render json: {
          tool: @tool_name,
          timeRange: { start: time_range[:start].iso8601, end: time_range[:end].iso8601 },
          users: top_users(events, limit)
        }
      end

      # GET /api/v1/organizations/:organization_id/stats/tools/:tool_name/daily
      # Optional params: days (int), period (day|week|month)
      def tool_daily
        authorize! current_organization, to: :show?

        days       = (params[:days] || 30).to_i.clamp(1, 730)
        trunc      = ALLOWED_PERIODS.include?(params[:period]) ? params[:period] : "day"
        time_range = parse_time_range(default_days: days)
        events     = @tool_events.where(occurred_at: time_range[:start]..time_range[:end])
        bucket_expr = Arel.sql("DATE_TRUNC('#{trunc}', occurred_at)")

        rows = events
          .group(bucket_expr)
          .select(
            Arel.sql("DATE_TRUNC('#{trunc}', occurred_at) as bucket"),
            "COUNT(*) as event_count",
            "SUM(tokens_in) as tokens_in",
            "SUM(tokens_out) as tokens_out",
            "SUM(cost_usd) as cost_usd"
          )
          .order(Arel.sql("bucket"))
          .each_with_object({}) do |row, h|
            h[row.bucket.to_date.iso8601] = {
              date:       row.bucket.to_date.iso8601,
              eventCount: row.event_count,
              tokensIn:   row.tokens_in  || 0,
              tokensOut:  row.tokens_out || 0,
              costUsd:    (row.cost_usd  || 0).to_f
            }
          end

        all_buckets = case trunc
        when "month"
          start_month = time_range[:start].beginning_of_month.to_date
          end_month   = time_range[:end].beginning_of_month.to_date
          months = []
          m = start_month
          while m <= end_month
            months << m.iso8601
            m = m.next_month
          end
          months
        when "week"
          start_week = time_range[:start].to_date.beginning_of_week(:monday)
          end_week   = time_range[:end].to_date.beginning_of_week(:monday)
          weeks = []
          w = start_week
          while w <= end_week
            weeks << w.iso8601
            w += 7
          end
          weeks
        else
          (time_range[:start].to_date..time_range[:end].to_date).map(&:iso8601)
        end

        daily = all_buckets.map do |bucket|
          rows[bucket] || { date: bucket, eventCount: 0, tokensIn: 0, tokensOut: 0, costUsd: 0.0 }
        end

        render json: {
          tool:      @tool_name,
          timeRange: { start: time_range[:start].iso8601, end: time_range[:end].iso8601 },
          period:    trunc,
          daily:     daily
        }
      end

      # GET /api/v1/organizations/:organization_id/stats/tools/:tool_name/event_types
      def tool_event_types
        authorize! current_organization, to: :show?

        time_range  = parse_time_range(default_days: (params[:days] || 30).to_i)
        events      = @tool_events.where(occurred_at: time_range[:start]..time_range[:end])
        event_types = aggregate_by_column(events, :event_type)

        render json: {
          tool:       @tool_name,
          timeRange:  { start: time_range[:start].iso8601, end: time_range[:end].iso8601 },
          eventTypes: event_types
        }
      end

      private

      def set_tool_scope
        tool = params[:tool_name]
        unless ToolEvent::TOOL_NAMES.include?(tool)
          return render json: { error: "Unknown tool: #{tool}" }, status: :unprocessable_content
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

      def split_model_key(name)
        return [ nil, nil ] if name.blank?
        return [ nil, name ] unless @tool_name == "openrouter_api" && name.include?("/")

        provider, routed_model = name.split("/", 2)
        [ provider, routed_model ]
      end

      def display_name_for_model(name, provider_slug, routed_model)
        return name if provider_slug.blank? || routed_model.blank?

        "#{provider_slug}/#{routed_model}"
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

      # Resolves time range from ?month=YYYY-MM (exact calendar month) or ?days=N (rolling window).
      def month_or_days_time_range
        if params[:month].present?
          month = Date.parse("#{params[:month]}-01")
          { start: month.beginning_of_month.beginning_of_day,
            end:   month.end_of_month.end_of_day }
        else
          parse_time_range(default_days: (params[:days] || 30).to_i)
        end
      end

      # Returns a time-scoped ToolEvent relation, optionally filtered to a project.
      # project_id is validated through the org to prevent cross-org data access.
      def scoped_events(time_range)
        base = if params[:project_id].present?
          current_organization.projects.find(params[:project_id]).tool_events
        else
          current_organization.tool_events
        end
        base.where(occurred_at: time_range[:start]..time_range[:end])
      end
    end
  end
end

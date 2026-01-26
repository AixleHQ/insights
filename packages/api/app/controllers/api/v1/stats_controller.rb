# frozen_string_literal: true

module Api
  module V1
    class StatsController < BaseController
      before_action :require_organization!

      # GET /api/v1/organizations/:organization_id/stats/overview
      def overview
        authorize! current_organization, to: :show?

        time_range = parse_time_range
        events = current_organization.tool_events
                                     .where(occurred_at: time_range[:start]..time_range[:end])

        data = {
          timeRange: {
            start: time_range[:start].iso8601,
            end: time_range[:end].iso8601
          },
          summary: {
            totalEvents: events.count,
            totalTokensIn: events.sum(:tokens_in),
            totalTokensOut: events.sum(:tokens_out),
            totalTokens: events.sum(:tokens_in) + events.sum(:tokens_out),
            totalCostUsd: events.sum(:cost_usd).to_f,
            totalDurationMs: events.sum(:duration_ms),
            uniqueUsers: events.distinct.count(:user_id),
            uniqueTools: events.distinct.count(:tool_name)
          },
          byTool: aggregate_by_column(events, :tool_name),
          byEventType: aggregate_by_column(events, :event_type),
          byModel: aggregate_by_column(events, :model),
          topUsers: top_users(events, 10),
          riskSummary: risk_summary(time_range)
        }

        render json: { data: data }
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
            'COUNT(*) as event_count',
            'SUM(tokens_in) as tokens_in',
            'SUM(tokens_out) as tokens_out',
            'SUM(cost_usd) as cost_usd',
            'COUNT(DISTINCT user_id) as unique_users'
          )
          .order('hour')
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
      def daily
        authorize! current_organization, to: :show?

        time_range = parse_time_range(default_days: 30)
        events = current_organization.tool_events
                                     .where(occurred_at: time_range[:start]..time_range[:end])

        daily_data = events
          .group("DATE_TRUNC('day', occurred_at)")
          .select(
            "DATE_TRUNC('day', occurred_at) as day",
            'COUNT(*) as event_count',
            'SUM(tokens_in) as tokens_in',
            'SUM(tokens_out) as tokens_out',
            'SUM(cost_usd) as cost_usd',
            'COUNT(DISTINCT user_id) as unique_users',
            'COUNT(DISTINCT tool_name) as unique_tools'
          )
          .order('day')
          .map do |row|
            {
              day: row.day&.to_date&.iso8601,
              eventCount: row.event_count,
              tokensIn: row.tokens_in || 0,
              tokensOut: row.tokens_out || 0,
              costUsd: (row.cost_usd || 0).to_f,
              uniqueUsers: row.unique_users,
              uniqueTools: row.unique_tools
            }
          end

        render json: {
          data: {
            timeRange: {
              start: time_range[:start].iso8601,
              end: time_range[:end].iso8601
            },
            daily: daily_data
          }
        }
      end

      private

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
            'COUNT(*) as event_count',
            'SUM(tokens_in) as tokens_in',
            'SUM(tokens_out) as tokens_out',
            'SUM(cost_usd) as cost_usd'
          )
          .order('event_count DESC')
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
            'user_id',
            'COUNT(*) as event_count',
            'SUM(tokens_in + tokens_out) as total_tokens',
            'SUM(cost_usd) as cost_usd'
          )
          .order('total_tokens DESC')
          .limit(limit)
          .map do |row|
            user = User.find_by(id: row.user_id)
            {
              userId: row.user_id,
              name: user&.name || 'Unknown',
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

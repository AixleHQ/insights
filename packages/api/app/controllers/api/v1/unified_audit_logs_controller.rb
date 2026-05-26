# frozen_string_literal: true

require "csv"

module Api
  module V1
    class UnifiedAuditLogsController < BaseController
      before_action :require_organization!

      VALID_SCOPES          = ::UnifiedAuditLogQueryBuilder::VALID_SCOPES
      VALID_SEVERITIES      = %w[info warning critical].freeze
      VALID_OUTCOMES        = %w[success failure].freeze
      EXPORT_PER_TABLE_LIMIT = 50_000

      # GET /api/v1/organizations/:organization_id/audit_logs/unified
      def index
        authorize! current_organization, to: :index?, with: ::UnifiedAuditLogPolicy

        return unless validate_unified_params!

        dates = parsed_date_params
        return unless dates

        from, to = dates
        result = build_unified_logs(from: from, to: to)
        paginated = paginate(Kaminari.paginate_array(result[:logs]))

        render json: {
          data: ::UnifiedAuditLogSerializer.new(paginated).serialize,
          meta: pagination_meta(paginated).merge(truncated: result[:truncated])
        }
      end

      # GET /api/v1/organizations/:organization_id/audit_logs/unified/export
      def export
        authorize! current_organization, to: :export?, with: ::UnifiedAuditLogPolicy

        return unless validate_unified_params!

        dates = parsed_date_params
        return unless dates

        from, to = dates
        result = build_unified_logs(from: from, to: to, cap: EXPORT_PER_TABLE_LIMIT)

        if result[:truncated]
          return render json: { error: "Export exceeds row limit. Apply date or scope filters to narrow results." },
                        status: :unprocessable_content
        end

        csv_data = CSV.generate(headers: true) do |csv|
          csv << %w[timestamp scope actor_email actor_name action resource_type resource_id
                    severity outcome ip_address user_agent]
          result[:logs].each do |log|
            actor = log.respond_to?(:actor) ? log.actor : log.try(:admin_user)
            scope = case log
            when ::OrganizationAuditLog then "organization"
            when ::ProjectAuditLog      then "project"
            when ::AdminAuditLog        then "admin"
            end
            csv << [
              log.created_at.iso8601,
              scope,
              actor&.email,
              actor&.name,
              log.action,
              log.resource_type,
              log.resource_id,
              log.severity,
              log.outcome,
              log.ip_address,
              log.user_agent
            ]
          end
        end

        send_data csv_data,
                  type: "text/csv; charset=utf-8",
                  disposition: "attachment; filename=\"audit_log_#{Time.current.strftime('%Y%m%d_%H%M%S')}.csv\""
      end

      private

      def validate_unified_params!
        if params[:scope].present? && VALID_SCOPES.exclude?(params[:scope])
          render_bad_request("Invalid scope")
          return false
        end
        if params[:severity].present? && VALID_SEVERITIES.exclude?(params[:severity])
          render_bad_request("Invalid severity")
          return false
        end
        if params[:outcome].present? && VALID_OUTCOMES.exclude?(params[:outcome])
          render_bad_request("Invalid outcome")
          return false
        end
        true
      end

      def parsed_date_params
        from_param = params[:from].presence || params[:from_date].presence
        to_param   = params[:to].presence   || params[:to_date].presence
        if from_param.present?
          from = parse_audit_log_date_param(from_param, :from, boundary: :start) or return
        end
        if to_param.present?
          to = parse_audit_log_date_param(to_param, :to, boundary: :end) or return
        end
        [ from, to ]
      end

      def build_unified_logs(from:, to:, cap: ::UnifiedAuditLogQueryBuilder::PER_TABLE_CAP)
        builder = ::UnifiedAuditLogQueryBuilder.new(
          organization: current_organization,
          params: {
            scope:    params[:scope],
            actor_id: params[:actor_id],
            severity: params[:severity],
            outcome:  params[:outcome],
            from:     from,
            to:       to
          },
          cap: cap
        )
        { logs: builder.call, truncated: builder.truncated }
      end

      def render_bad_request(message)
        render json: { error: message }, status: :bad_request
      end
    end
  end
end

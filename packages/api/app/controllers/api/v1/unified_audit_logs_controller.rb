# frozen_string_literal: true

module Api
  module V1
    class UnifiedAuditLogsController < BaseController
      before_action :require_organization!

      VALID_SCOPES     = UnifiedAuditLogQueryBuilder::VALID_SCOPES
      VALID_SEVERITIES = %w[info warning critical].freeze
      VALID_OUTCOMES   = %w[success failure].freeze

      # GET /api/v1/organizations/:organization_id/audit_logs/unified
      def index
        authorize! current_organization, to: :index?, with: UnifiedAuditLogPolicy

        return render_bad_request("Invalid scope")    if params[:scope].present?    && VALID_SCOPES.exclude?(params[:scope])
        return render_bad_request("Invalid severity") if params[:severity].present? && VALID_SEVERITIES.exclude?(params[:severity])
        return render_bad_request("Invalid outcome")  if params[:outcome].present?  && VALID_OUTCOMES.exclude?(params[:outcome])

        from_param = params[:from].presence || params[:from_date].presence
        to_param   = params[:to].presence   || params[:to_date].presence

        from = parse_date_param(from_param, :from) or return if from_param.present?
        to   = parse_date_param(to_param,   :to)   or return if to_param.present?

        builder = UnifiedAuditLogQueryBuilder.new(
          organization: current_organization,
          params: {
            scope:    params[:scope],
            actor_id: params[:actor_id],
            severity: params[:severity],
            outcome:  params[:outcome],
            from:     from,
            to:       to
          }
        )
        logs = builder.call
        paginated = paginate(Kaminari.paginate_array(logs))

        render json: {
          data: UnifiedAuditLogSerializer.new(paginated).serialize,
          meta: pagination_meta(paginated).merge(truncated: builder.truncated)
        }
      end

      private

      def render_bad_request(message)
        render json: { error: message }, status: :bad_request
      end
    end
  end
end

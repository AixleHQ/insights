# frozen_string_literal: true

module Api
  module V1
    class ReportsController < BaseController
      VALID_REPORT_TYPES = %w[cost_by_user cost_by_project cost_by_tool token_by_user token_by_tool].freeze
      VALID_FORMATS      = %w[csv json].freeze
      VALID_GROUP_BY     = %w[day week month].freeze

      before_action :require_organization!

      # GET /api/v1/organizations/:organization_id/reports/export
      def export
        authorize! current_organization, to: :export_report?

        return render_invalid_param("report_type", VALID_REPORT_TYPES) unless valid_report_type?
        return render_invalid_param("format", VALID_FORMATS) if params[:format].present? && !valid_format?
        return render_invalid_param("group_by", VALID_GROUP_BY) if params[:group_by].present? && !valid_group_by?

        report = AggregatedReportQueryBuilder.new(
          organization: current_organization,
          params: export_params
        ).call

        if csv_format?
          send_data AggregatedReportCsvExporter.generate(report.rows, report.columns),
                    filename: export_filename,
                    type: "text/csv",
                    disposition: "attachment"
        else
          render json: { data: report.rows }
        end
      end

      private

      def export_params
        params.permit(:report_type, :format, :from, :to, :project_id, :group_by)
      end

      def valid_report_type?
        VALID_REPORT_TYPES.include?(params[:report_type])
      end

      def valid_format?
        VALID_FORMATS.include?(params[:format])
      end

      def valid_group_by?
        VALID_GROUP_BY.include?(params[:group_by])
      end

      def csv_format?
        params[:format] == "csv"
      end

      def export_filename
        from_label = params[:from].presence || "all"
        to_label   = params[:to].presence   || Date.current.iso8601
        "db90-report-#{params[:report_type]}-#{from_label}-#{to_label}.csv"
      end

      def render_invalid_param(param, valid_values)
        render json: {
          error: "Unprocessable Entity",
          message: "Invalid #{param}. Must be one of: #{valid_values.join(', ')}"
        }, status: :unprocessable_content
      end
    end
  end
end

# frozen_string_literal: true

module Api
  module V1
    class UserExportsController < BaseController
      # GET /api/v1/users/me/exports
      def show
        authorize! current_user, with: UserExportPolicy

        return render_invalid_param("report_type", PersonalReportQueryBuilder::VALID_REPORT_TYPES) unless valid_report_type?
        return render_invalid_param("format", PersonalReportQueryBuilder::VALID_FORMATS) if params[:format].present? && !valid_format?

        builder = PersonalReportQueryBuilder.new(user: current_user, params: export_params)

        begin
          report = builder.call
        rescue PersonalReportQueryBuilder::DateRangeTooLargeError => e
          return render json: { error: "Unprocessable Entity", message: e.message },
                        status: :unprocessable_content
        end

        if csv_format?
          send_data builder.to_csv(report),
                    filename: export_filename,
                    type: "text/csv",
                    disposition: "attachment"
        else
          render json: { data: report.rows }
        end
      end

      private

      def export_params
        params.permit(:report_type, :format, :from, :to)
      end

      def valid_report_type?
        PersonalReportQueryBuilder::VALID_REPORT_TYPES.include?(params[:report_type])
      end

      def valid_format?
        PersonalReportQueryBuilder::VALID_FORMATS.include?(params[:format])
      end

      def csv_format?
        params[:format] == "csv"
      end

      def export_filename
        from_label = params[:from].presence || "all"
        to_label   = params[:to].presence   || Date.current.iso8601
        "db90-personal-#{params[:report_type]}-#{from_label}-#{to_label}.csv"
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

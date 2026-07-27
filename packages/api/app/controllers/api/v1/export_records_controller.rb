# frozen_string_literal: true

module Api
  module V1
    class ExportRecordsController < BaseController
      before_action :require_organization!

      # GET /api/v1/organizations/:organization_id/export_records
      def index
        authorize! current_organization, to: :index?, with: ExportRecordPolicy
        records = current_organization.export_records
                                      .includes(:created_by, file_attachment: :blob)
                                      .recent_first
        render_collection(records, ExportRecordSerializer)
      end

      # POST /api/v1/organizations/:organization_id/export_records
      def create
        authorize! current_organization, to: :create?, with: ExportRecordPolicy

        record = current_organization.export_records.new(
          export_params.merge(created_by: current_user)
        )

        unless record.valid?
          render json: { error: "Unprocessable Entity",
                         errors: format_validation_errors(record.errors) },
                 status: :unprocessable_content
          return
        end

        record.save!
        GenerateExportJob.perform_async(record.id)

        render json: { data: ExportRecordSerializer.new(record).serializable_hash },
               status: :accepted
      end

      private

      def export_params
        params.require(:export_record).permit(:report_type, :format)
      end
    end
  end
end

# frozen_string_literal: true

module Api
  module V1
    class ScheduledExportsController < BaseController
      before_action :require_organization!
      before_action :set_scheduled_export, only: %i[update destroy]

      def index
        authorize! current_organization, to: :index?, with: ScheduledExportPolicy
        exports = current_organization.scheduled_exports.order(created_at: :desc)
        render_collection(exports, ScheduledExportSerializer)
      end

      def create
        @export = current_organization.scheduled_exports.new(export_params.merge(created_by: current_user))
        authorize! @export
        if @export.save
          render_created(@export, ScheduledExportSerializer)
        else
          render json: { error: "Unprocessable Entity",
                         errors: format_validation_errors(@export.errors) },
                 status: :unprocessable_content
        end
      end

      def update
        authorize! @export
        if @export.update(export_params)
          render_resource(@export, ScheduledExportSerializer)
        else
          render json: { error: "Unprocessable Entity",
                         errors: format_validation_errors(@export.errors) },
                 status: :unprocessable_content
        end
      end

      def destroy
        authorize! @export
        @export.destroy!
        render_no_content
      end

      private

      def set_scheduled_export
        @export = current_organization.scheduled_exports.find(params[:id])
      end

      def export_params
        params.require(:scheduled_export).permit(
          :report_type, :format, :frequency, :day_of_week, :day_of_month, :group_by, :active,
          recipients: []
        )
      end
    end
  end
end

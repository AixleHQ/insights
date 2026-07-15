# frozen_string_literal: true

module Api
  module V1
    # Provides status and download endpoints for large (> 100k row) async exports.
    #
    # Redis keys are scoped to (org_id, user_id, jid) so a guessed job ID
    # cannot leak another user's export data.
    class EventExportJobsController < BaseController
      before_action :require_organization!

      # GET /api/v1/organizations/:organization_id/event_export_jobs/:id
      # Returns { job_id, status: "pending" | "complete" | "failed" | "not_found" }
      def show
        authorize! current_organization, to: :show?

        status = REDIS.get(status_key) || "not_found"
        render json: { job_id: params[:id], status: status }
      end

      # GET /api/v1/organizations/:organization_id/event_export_jobs/:id/download
      # Streams the CSV once the job is complete; 404 if not ready or expired.
      def download
        authorize! current_organization, to: :show?

        csv = REDIS.get(data_key)
        if csv.nil?
          render json: { error: "Export not ready or expired" }, status: :not_found
          return
        end

        send_data csv,
                  filename: "aixle-insights-events-export-#{params[:id]}.csv",
                  type: "text/csv",
                  disposition: "attachment"
      end

      private

      # Keys scoped to org + user so cross-session guessing returns nothing
      def status_key
        ToolEventExportJob.status_key(current_user.id, current_organization.id, params[:id])
      end

      def data_key
        ToolEventExportJob.data_key(current_user.id, current_organization.id, params[:id])
      end
    end
  end
end

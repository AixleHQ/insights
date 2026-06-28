# frozen_string_literal: true

module Api
  module V1
    class RetentionPurgeLogsController < BaseController
      before_action :require_organization!

      # GET /api/v1/organizations/:organization_id/retention_logs
      def index
        authorize! current_organization, to: :index?, with: RetentionPurgeLogPolicy

        logs = authorized_scope(
          current_organization.retention_purge_logs.order(job_run_at: :desc),
          with: RetentionPurgeLogPolicy
        )

        render_collection(logs, RetentionPurgeLogSerializer)
      end
    end
  end
end

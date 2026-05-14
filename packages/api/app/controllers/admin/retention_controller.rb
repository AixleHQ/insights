# frozen_string_literal: true

module Admin
  class RetentionController < ApplicationController
    # POST /admin/retention/purge
    def purge
      DataRetentionPurgeJob.perform_async
      render json: { enqueued: true }, status: :ok
    end

    # GET /admin/retention_logs
    def index
      logs = RetentionPurgeLog.includes(:organization, :project)
                              .order(job_run_at: :desc)

      page = (params[:page] || 1).to_i
      per_page = [ (params[:per_page] || 25).to_i, 100 ].min
      per_page = 1 if per_page < 1

      paginated = logs.page(page).per(per_page)

      render json: {
        data: RetentionPurgeLogSerializer.new(paginated).serialize,
        meta: {
          current_page: paginated.current_page,
          total_pages: paginated.total_pages,
          total_count: paginated.total_count,
          per_page: paginated.limit_value
        }
      }, status: :ok
    end
  end
end

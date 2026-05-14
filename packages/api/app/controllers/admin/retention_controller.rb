# frozen_string_literal: true

module Admin
  class RetentionController < ApplicationController
    def purge
      DataRetentionPurgeJob.perform_async
      render json: { enqueued: true }, status: :ok
    end
  end
end

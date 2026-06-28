# frozen_string_literal: true

class CursorDailyJob < ApplicationJob
  queue_as :connectors

  def perform
    CursorSyncJob.enqueue_all
  end
end

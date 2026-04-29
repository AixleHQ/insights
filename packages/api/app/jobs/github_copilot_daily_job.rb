# frozen_string_literal: true

class GithubCopilotDailyJob < ApplicationJob
  queue_as :connectors

  def perform
    GithubCopilotSyncJob.enqueue_all
  end
end

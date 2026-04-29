# frozen_string_literal: true

Sidekiq.configure_server do |config|
  config.on(:startup) do
    Sidekiq::Cron::Job.load_from_hash({
      "ai_usage_sync" => {
        "class" => "AiUsageSyncJob",
        "cron" => "0 */4 * * *",
        "queue" => "ai",
        "description" => "Sync AI tool usage from provider APIs (Anthropic, OpenAI, etc.) every 4 hours"
      },
      "github_copilot_daily" => {
        "class" => "GithubCopilotDailyJob",
        "cron" => "0 6 * * *",
        "queue" => "connectors",
        "description" => "Fan out daily GitHub Copilot usage sync for all active connectors"
      }
    })
  end
end

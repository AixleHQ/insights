# frozen_string_literal: true

Sidekiq.configure_server do |config|
  config.on(:startup) do
    Sidekiq::Cron::Job.load_from_hash({
      "ai_usage_sync" => {
        "class" => "AiUsageSyncJob",
        "cron" => "0 */4 * * *",
        "queue" => "ai",
        "description" => "Sync AI tool usage from provider APIs (OpenRouter, Anthropic, OpenAI) every 4 hours. Gemini: connector heartbeat only — usage captured per request via AI Gateway."
      },
      "github_copilot_daily" => {
        "class" => "GithubCopilotDailyJob",
        "cron" => "0 6 * * *",
        "queue" => "connectors",
        "description" => "Fan out daily GitHub Copilot usage sync for all active connectors"
      },
      "update_timescale_retention" => {
        "class" => "UpdateTimescaleRetentionJob",
        "cron" => "0 1 * * *",
        "queue" => "maintenance",
        "description" => "Daily sync of TimescaleDB retention policy ceiling from MAX_RETENTION_DAYS env var"
      },
      "data_retention_purge" => {
        "class" => "DataRetentionPurgeJob",
        "cron" => "0 2 * * *",
        "queue" => "maintenance",
        "description" => "Daily purge of expired tool_events per org/project retention policies"
      }
    })
  end
end

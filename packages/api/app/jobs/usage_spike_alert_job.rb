# frozen_string_literal: true

class UsageSpikeAlertJob
  include Sidekiq::Job

  sidekiq_options queue: "alerts", retry: 3

  DEFAULT_SPIKE_MULTIPLIER = 3.0  # current hour must be 3x the baseline average
  DEFAULT_MINIMUM_COST_USD = 1.0  # minimum cost to avoid noise on tiny amounts
  BASELINE_DAYS = 7               # days of history to compute the hourly baseline

  def perform(organization_id = nil)
    Rails.logger.info("[UsageSpikeAlertJob] Checking usage spikes...")

    stats = { organizations_checked: 0, alerts_sent: 0, errors: [] }

    organizations = if organization_id
                      Organization.where(id: organization_id)
    else
                      Organization.all
    end

    organizations.find_each do |org|
      begin
        alerts = check_organization_for_spikes(org)
        stats[:organizations_checked] += 1
        stats[:alerts_sent] += alerts
      rescue => e
        stats[:errors] << { organization_id: org.id, error: e.message }
        Rails.logger.error("[UsageSpikeAlertJob] Error checking org #{org.slug}: #{e.message}")
      end
    end

    Rails.logger.info("[UsageSpikeAlertJob] Completed. Checked: #{stats[:organizations_checked]}, Alerts: #{stats[:alerts_sent]}, Errors: #{stats[:errors].size}")
    stats
  end

  private

  def check_organization_for_spikes(org)
    settings = load_settings(org)
    return 0 unless settings[:alert_usage_spike]

    current = current_hour_cost(org)
    baseline = baseline_hourly_cost(org)

    return 0 if baseline < settings[:minimum_cost_usd]
    return 0 if current < settings[:minimum_cost_usd]

    ratio = current / baseline
    return 0 if ratio < settings[:spike_multiplier]

    send_spike_alert(org, current, baseline, ratio, settings)
    1
  end

  def load_settings(org)
    raw = org.organization_settings
             .where(key: %w[alert_usage_spike usage_spike_multiplier usage_spike_minimum_cost_usd alert_slack])
             .pluck(:key, :value)
             .to_h

    {
      alert_usage_spike: raw["alert_usage_spike"] == "true",
      spike_multiplier: raw["usage_spike_multiplier"]&.to_f || DEFAULT_SPIKE_MULTIPLIER,
      minimum_cost_usd: raw["usage_spike_minimum_cost_usd"]&.to_f || DEFAULT_MINIMUM_COST_USD,
      alert_slack: raw["alert_slack"] == "true"
    }
  end

  def current_hour_cost(org)
    org.tool_events
       .where("occurred_at >= ?", Time.current.beginning_of_hour)
       .sum(:cost_usd)
       .to_f
  end

  def baseline_hourly_cost(org)
    hour_of_day = Time.current.hour
    start_time = BASELINE_DAYS.days.ago

    total = org.tool_events
               .where("occurred_at >= ? AND occurred_at < ?", start_time, Time.current.beginning_of_hour)
               .where("EXTRACT(HOUR FROM occurred_at) = ?", hour_of_day)
               .sum(:cost_usd)
               .to_f

    total / BASELINE_DAYS
  end

  def send_spike_alert(org, current_cost, baseline_cost, ratio, settings)
    cache_key = "usage_spike_alert:#{org.id}:#{Time.current.strftime('%Y-%m-%d-%H')}"
    return if Rails.cache.read(cache_key)

    alert_data = {
      type: "usage_spike",
      alert_type: "usage_spike",
      severity: "warning",
      current_cost_usd: current_cost.round(2),
      baseline_cost_usd: baseline_cost.round(2),
      spike_ratio: ratio.round(1),
      title: "Usage spike detected: #{ratio.round(1)}x above baseline"
    }

    EventsChannel.broadcast_alert(org.id, alert_data)

    Slack::NotificationService.deliver_alert(org, alert_data) if settings[:alert_slack]

    deliver_to_project_slack_webhooks(org, alert_data)

    Rails.logger.info("[UsageSpikeAlertJob] Spike alert sent for org #{org.slug}: #{ratio.round(1)}x above baseline ($#{current_cost.round(2)} vs $#{baseline_cost.round(2)} avg)")

    Rails.cache.write(cache_key, true, expires_in: 1.hour)
  end

  def deliver_to_project_slack_webhooks(org, alert_data)
    org.projects.find_each do |project|
      next unless ProjectSetting.get(project, "alert_slack") == "true"

      Slack::ProjectNotificationService.deliver_alert(project, alert_data)
    end
  end
end

# frozen_string_literal: true

class CostAlertJob
  include Sidekiq::Job

  sidekiq_options queue: "alerts", retry: 3

  # Default thresholds in USD
  DEFAULT_THRESHOLDS = {
    daily: 100.0,    # $100
    weekly: 500.0,   # $500
    monthly: 2000.0  # $2000
  }.freeze

  def perform(organization_id = nil)
    Rails.logger.info("[CostAlertJob] Checking cost thresholds...")

    stats = { organizations_checked: 0, alerts_sent: 0, errors: [] }

    organizations = if organization_id
                      Organization.where(id: organization_id)
    else
                      Organization.all
    end

    organizations.find_each do |org|
      begin
        alerts = check_organization_thresholds(org)
        stats[:organizations_checked] += 1
        stats[:alerts_sent] += alerts
      rescue => e
        stats[:errors] << { organization_id: org.id, error: e.message }
        Rails.logger.error("[CostAlertJob] Error checking org #{org.slug}: #{e.message}")
      end
    end

    Rails.logger.info("[CostAlertJob] Completed. Checked: #{stats[:organizations_checked]}, Alerts: #{stats[:alerts_sent]}, Errors: #{stats[:errors].size}")
    stats
  end

  private

  def check_organization_thresholds(org)
    thresholds = load_thresholds(org)
    alerts_sent = 0

    slack_enabled = thresholds[:alert_slack]

    # Check daily threshold
    if thresholds[:daily] && daily_cost(org) >= thresholds[:daily]
      send_alert(org, :daily, daily_cost(org), thresholds[:daily], slack_enabled)
      alerts_sent += 1
    end

    # Check weekly threshold
    if thresholds[:weekly] && weekly_cost(org) >= thresholds[:weekly]
      send_alert(org, :weekly, weekly_cost(org), thresholds[:weekly], slack_enabled)
      alerts_sent += 1
    end

    # Check monthly threshold
    if thresholds[:monthly] && monthly_cost(org) >= thresholds[:monthly]
      send_alert(org, :monthly, monthly_cost(org), thresholds[:monthly], slack_enabled)
      alerts_sent += 1
    end

    # Check per-user thresholds
    alerts_sent += check_user_thresholds(org, thresholds, slack_enabled)

    alerts_sent
  end

  def load_thresholds(org)
    settings = org.organization_settings.where(key: %w[cost_threshold_daily cost_threshold_weekly cost_threshold_monthly cost_threshold_per_user alert_slack])
                  .pluck(:key, :value)
                  .to_h

    {
      daily: settings["cost_threshold_daily"]&.to_f || DEFAULT_THRESHOLDS[:daily],
      weekly: settings["cost_threshold_weekly"]&.to_f || DEFAULT_THRESHOLDS[:weekly],
      monthly: settings["cost_threshold_monthly"]&.to_f || DEFAULT_THRESHOLDS[:monthly],
      per_user: settings["cost_threshold_per_user"]&.to_f,
      alert_slack: settings["alert_slack"] == "true"
    }
  end

  def daily_cost(org)
    (org.tool_events
       .where("occurred_at >= ?", Time.current.beginning_of_day)
       .sum(:cost_usd) || 0).to_f
  end

  def weekly_cost(org)
    (org.tool_events
       .where("occurred_at >= ?", Time.current.beginning_of_week)
       .sum(:cost_usd) || 0).to_f
  end

  def monthly_cost(org)
    (org.tool_events
       .where("occurred_at >= ?", Time.current.beginning_of_month)
       .sum(:cost_usd) || 0).to_f
  end

  def check_user_thresholds(org, thresholds, slack_enabled = false)
    return 0 unless thresholds[:per_user]

    alerts_sent = 0

    user_costs = org.tool_events
                    .where("occurred_at >= ?", Time.current.beginning_of_day)
                    .where.not(user_id: nil)
                    .group(:user_id)
                    .sum(:cost_usd)

    user_costs.each do |user_id, cost|
      if cost && cost >= thresholds[:per_user]
        send_user_alert(org, user_id, cost, thresholds[:per_user], slack_enabled)
        alerts_sent += 1
      end
    end

    alerts_sent
  end

  def send_alert(org, period, current_cost, threshold, slack_enabled = false)
    # Check if we already sent this alert today
    cache_key = "cost_alert:#{org.id}:#{period}:#{Date.today}"
    return if Rails.cache.read(cache_key)

    alert_data = {
      type: "cost_threshold",
      alert_type: "cost_threshold",
      severity: "warning",
      period: period.to_s,
      current_cost_usd: current_cost.round(2),
      threshold_usd: threshold.round(2),
      percentage: ((current_cost / threshold) * 100).round(1)
    }

    # Broadcast via ActionCable
    EventsChannel.broadcast_alert(org.id, alert_data)

    # Deliver to Slack if enabled (org-level)
    Slack::NotificationService.deliver_alert(org, alert_data) if slack_enabled

    # Deliver to project Slack webhooks where individually enabled
    deliver_to_project_slack_webhooks(org, alert_data)

    Rails.logger.info("[CostAlertJob] Alert sent for org #{org.slug}: #{period} cost $#{current_cost.round(2)} exceeds threshold $#{threshold.round(2)}")

    # Mark as sent
    Rails.cache.write(cache_key, true, expires_in: 24.hours)
  end

  def send_user_alert(org, user_id, current_cost, threshold, slack_enabled = false)
    cache_key = "cost_alert:#{org.id}:user:#{user_id}:#{Date.today}"
    return if Rails.cache.read(cache_key)

    user = User.find_by(id: user_id)
    return unless user

    alert_data = {
      type: "user_cost_threshold",
      alert_type: "user_cost_threshold",
      severity: "warning",
      user_id: user_id,
      user_email: user.email,
      current_cost_usd: current_cost.round(2),
      threshold_usd: threshold.round(2),
      percentage: ((current_cost / threshold) * 100).round(1)
    }

    EventsChannel.broadcast_alert(org.id, alert_data)

    Slack::NotificationService.deliver_alert(org, alert_data) if slack_enabled

    # Deliver to project Slack webhooks where individually enabled
    deliver_to_project_slack_webhooks(org, alert_data)

    Rails.logger.info("[CostAlertJob] User alert sent for #{user.email} in org #{org.slug}: cost $#{current_cost.round(2)} exceeds threshold $#{threshold.round(2)}")

    Rails.cache.write(cache_key, true, expires_in: 24.hours)
  end

  def deliver_to_project_slack_webhooks(org, alert_data)
    org.projects.find_each do |project|
      next unless ProjectSetting.get(project, "alert_slack") == "true"

      Slack::ProjectNotificationService.deliver_alert(project, alert_data)
    end
  end
end

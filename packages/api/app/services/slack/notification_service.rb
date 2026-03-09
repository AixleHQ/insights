# frozen_string_literal: true

module Slack
  class NotificationService
    def self.deliver_alert(org, alert_data)
      new(org).deliver_alert(alert_data)
    end

    def initialize(org)
      @org = org
    end

    def deliver_alert(alert_data)
      connector = @org.organization_connectors.by_type("slack").active.first

      unless connector
        Rails.logger.warn("[Slack::NotificationService] No active Slack connector for org #{@org.slug}")
        return
      end

      response = Faraday.post(connector.access_token) do |req|
        req.headers["Content-Type"] = "application/json"
        req.body = format_message(alert_data).to_json
      end

      unless response.success?
        Rails.logger.error("[Slack::NotificationService] Failed to deliver alert to Slack for org #{@org.slug}: HTTP #{response.status}")
      end
    rescue Faraday::Error => e
      Rails.logger.error("[Slack::NotificationService] Connection error delivering Slack alert for org #{@org.slug}: #{e.message}")
    end

    private

    def format_message(alert_data)
      alert_type = alert_data[:alert_type] || alert_data[:type] || "alert"
      severity   = alert_data[:severity] || "warning"
      timestamp  = Time.current.iso8601

      severity_emoji = case severity.to_s
      when "critical" then ":red_circle:"
      when "warning"  then ":large_yellow_circle:"
      else ":large_blue_circle:"
      end

      lines = [
        "#{severity_emoji} *#{@org.name}* — #{alert_type.to_s.tr('_', ' ').capitalize}",
        "*Type:* #{alert_type}",
        "*Severity:* #{severity}",
        "*Time:* #{timestamp}"
      ]

      if alert_data[:title].present?
        lines.insert(1, "*Details:* #{alert_data[:title]}")
      end

      if alert_data[:current_cost_usd].present?
        lines.insert(-2, "*Cost:* $#{alert_data[:current_cost_usd]} / $#{alert_data[:threshold_usd]} threshold (#{alert_data[:percentage]}%)")
      end

      { text: lines.join("\n") }
    end
  end
end

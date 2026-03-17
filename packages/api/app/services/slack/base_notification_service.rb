# frozen_string_literal: true

module Slack
  class BaseNotificationService
    def self.deliver_alert(resource, alert_data)
      new(resource).deliver_alert(alert_data)
    end

    def deliver_alert(alert_data)
      connector = find_connector

      unless connector
        Rails.logger.warn("[#{self.class.name}] No active Slack connector for #{resource_identifier}")
        return
      end

      response = Faraday.post(connector.access_token) do |req|
        req.headers["Content-Type"] = "application/json"
        req.body = format_message(alert_data).to_json
      end

      unless response.success?
        Rails.logger.error("[#{self.class.name}] Failed to deliver alert to Slack for #{resource_identifier}: HTTP #{response.status}")
      end
    rescue Faraday::Error => e
      Rails.logger.error("[#{self.class.name}] Connection error delivering Slack alert for #{resource_identifier}: #{e.message}")
    end

    private

    def find_connector
      raise NotImplementedError, "#{self.class.name} must implement #find_connector"
    end

    def display_name
      raise NotImplementedError, "#{self.class.name} must implement #display_name"
    end

    def resource_identifier
      raise NotImplementedError, "#{self.class.name} must implement #resource_identifier"
    end

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
        "#{severity_emoji} *#{display_name}* — #{alert_type.to_s.tr('_', ' ').capitalize}",
        "*Type:* #{alert_type}",
        "*Severity:* #{severity}",
        "*Time:* #{timestamp}"
      ]

      lines.insert(1, "*Details:* #{alert_data[:title]}") if alert_data[:title].present?

      if alert_data[:current_cost_usd].present?
        lines.insert(-2, "*Cost:* $#{alert_data[:current_cost_usd]} / $#{alert_data[:threshold_usd]} threshold (#{alert_data[:percentage]}%)")
      end

      { text: lines.join("\n") }
    end
  end
end

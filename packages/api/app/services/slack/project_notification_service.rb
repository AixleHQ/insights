# frozen_string_literal: true

module Slack
  class ProjectNotificationService < BaseNotificationService
    def initialize(project)
      @project = project
    end

    def deliver_alert(alert_data)
      connectors = @project.project_connectors.by_type("slack").active.to_a

      if connectors.empty?
        Rails.logger.warn("[Slack::ProjectNotificationService] No active Slack connectors for project #{@project.slug}")
        return
      end

      connectors.each { |connector| deliver_to(connector, alert_data) }
    end

    private

    def find_connector
      @project.project_connectors.by_type("slack").active.first
    end

    def display_name
      @project.organization&.name || "Unknown"
    end

    def resource_identifier
      "project #{@project.slug}"
    end

    def deliver_to(connector, alert_data)
      response = Faraday.post(connector.access_token) do |req|
        req.headers["Content-Type"] = "application/json"
        req.body = format_message(alert_data).to_json
      end

      return if response.success?

      Rails.logger.error(
        "[Slack::ProjectNotificationService] Failed to deliver alert for project #{@project.slug} " \
        "connector #{connector.id}: HTTP #{response.status}"
      )
    rescue Faraday::Error => e
      Rails.logger.error(
        "[Slack::ProjectNotificationService] Connection error for project #{@project.slug} " \
        "connector #{connector.id}: #{e.message}"
      )
    end
  end
end

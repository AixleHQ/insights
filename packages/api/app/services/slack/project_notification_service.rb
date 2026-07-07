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

    def display_name
      @project.organization&.name || "Unknown"
    end

    def resource_identifier
      "project #{@project.slug}"
    end
  end
end

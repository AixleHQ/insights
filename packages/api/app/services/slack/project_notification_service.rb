# frozen_string_literal: true

module Slack
  class ProjectNotificationService < BaseNotificationService
    def initialize(project)
      @project = project
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
  end
end

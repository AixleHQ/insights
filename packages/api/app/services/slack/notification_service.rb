# frozen_string_literal: true

module Slack
  class NotificationService < BaseNotificationService
    def initialize(org)
      @org = org
    end

    private

    def find_connector
      @org.organization_connectors.by_type("slack").active.first
    end

    def display_name
      @org.name
    end

    def resource_identifier
      "org #{@org.slug}"
    end
  end
end

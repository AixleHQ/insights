# frozen_string_literal: true

module Oauth
  class SlackProvider < BaseProvider
    WEBHOOK_URL_PATTERN = %r{\Ahttps://hooks\.slack\.com/services/[A-Z0-9]+/[A-Z0-9]+/\S+\z}

    def test_connection
      webhook_url = connector.access_token

      if webhook_url.blank?
        return { success: false, error: "Webhook URL is required" }
      end

      unless webhook_url.match?(WEBHOOK_URL_PATTERN)
        return { success: false, error: "Invalid Slack webhook URL format" }
      end

      { success: true }
    end
  end
end

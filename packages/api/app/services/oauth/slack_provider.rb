# frozen_string_literal: true

module Oauth
  class SlackProvider < BaseProvider
    WEBHOOK_URL_PATTERN = %r{\Ahttps://hooks\.slack\.com/services/[A-Z0-9]+/[A-Z0-9]+/\S+\z}
    TEST_MESSAGE = { text: "Test message from Aixle Insights — your Slack integration is working!" }.freeze

    def test_connection
      webhook_url = connector.access_token

      return { success: false, error: "Webhook URL is required" } if webhook_url.blank?

      unless webhook_url.match?(WEBHOOK_URL_PATTERN)
        return { success: false, error: "Invalid Slack webhook URL format" }
      end

      response = Faraday.post(webhook_url) do |req|
        req.headers["Content-Type"] = "application/json"
        req.body = TEST_MESSAGE.to_json
      end

      if response.success?
        { success: true }
      else
        { success: false, error: "Slack webhook error (HTTP #{response.status})" }
      end
    rescue Faraday::Error => e
      { success: false, error: "Connection error: #{e.message}" }
    end
  end
end

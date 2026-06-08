# frozen_string_literal: true

module Oauth
  class GeminiProvider < BaseProvider
    API_URL = "https://generativelanguage.googleapis.com"

    def fetch_usage
      Rails.logger.info(
        "[GeminiProvider] org=#{connector.organization_id} — " \
        "Google AI Studio has no historical usage API. " \
        "Usage is captured per-request via Ai::ProxyService. Skipping fetch."
      )
      nil
    end

    def test_connection
      response = Faraday.get("#{API_URL}/v1beta/models") do |req|
        req.params["key"] = connector.access_token
        req.headers["Accept"] = "application/json"
      end

      if response.success?
        { success: true }
      elsif response.status == 401 || response.status == 403
        { success: false, error: "Invalid API key" }
      else
        { success: false, error: "Gemini API error: #{response.status}" }
      end
    rescue Faraday::Error => e
      { success: false, error: "Connection error: #{e.message}" }
    end
  end
end

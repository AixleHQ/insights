# frozen_string_literal: true

module Oauth
  class OpenaiProvider < BaseProvider
    API_URL = "https://api.openai.com"

    def test_connection
      response = Faraday.get("#{API_URL}/v1/models") do |req|
        req.headers["Authorization"] = "Bearer #{connector.access_token}"
        req.headers["Accept"] = "application/json"
      end

      if response.success?
        { success: true }
      elsif response.status == 401 || response.status == 403
        { success: false, error: "Invalid API key" }
      else
        { success: false, error: "OpenAI API error: #{response.status}" }
      end
    rescue Faraday::Error => e
      { success: false, error: "Connection error: #{e.message}" }
    end
  end
end

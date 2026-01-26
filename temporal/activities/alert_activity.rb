require "temporalio/activity"
require "net/http"
require "json"

module Activities
  class AlertActivity < Temporalio::Activity::Definition
    HIGH_RISK_LEVELS = %w[high critical].freeze

    def execute(params)
      Temporalio::Activity::Context.current.heartbeat("Checking if alert needed")

      classification = params["classification"]
      event = params["event"]
      tool_event_id = params["tool_event_id"]

      risk_level = classification["risk_level"]

      unless HIGH_RISK_LEVELS.include?(risk_level)
        return {
          "alert_sent" => false,
          "reason" => "Risk level #{risk_level} below threshold"
        }
      end

      Temporalio::Activity::Context.current.heartbeat("Sending high-risk alert")

      # Send alert via Rails API
      alert_result = send_alert(
        organization_id: event["organization_id"],
        tool_event_id: tool_event_id,
        risk_level: risk_level,
        classification: classification
      )

      {
        "alert_sent" => true,
        "alert_id" => alert_result["id"],
        "risk_level" => risk_level,
        "sent_at" => Time.now.utc.iso8601
      }
    end

    private

    def send_alert(organization_id:, tool_event_id:, risk_level:, classification:)
      api_url = ENV.fetch("RAILS_API_URL", "http://localhost:3000")
      api_key = ENV.fetch("INTERNAL_API_KEY", nil)

      uri = URI("#{api_url}/api/internal/alerts")
      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl = uri.scheme == "https"

      request = Net::HTTP::Post.new(uri)
      request["Authorization"] = "Bearer #{api_key}" if api_key
      request["Content-Type"] = "application/json"
      request.body = {
        alert: {
          organization_id: organization_id,
          alert_type: "high_risk_event",
          severity: risk_level,
          title: "High-Risk Event Detected",
          message: build_alert_message(classification),
          metadata: {
            "tool_event_id" => tool_event_id,
            "risk_score" => classification["risk_score"],
            "detections" => classification["detections"]
          }
        }
      }.to_json

      response = http.request(request)

      if response.code.to_i == 201
        JSON.parse(response.body)["data"]
      else
        # Log error but don't fail the workflow
        {
          "id" => nil,
          "error" => "Failed to send alert: #{response.body}"
        }
      end
    end

    def build_alert_message(classification)
      detections = classification["detections"] || []
      return "High-risk event detected with no specific detections" if detections.empty?

      parts = ["High-risk event detected:"]
      detections.each do |detection|
        parts << "- #{detection['count']} #{detection['category']}/#{detection['pattern']} detection(s)"
      end
      parts << "\nRisk score: #{classification['risk_score']}"

      parts.join("\n")
    end
  end
end

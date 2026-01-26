require "temporalio/activity"
require "net/http"
require "json"

module Activities
  class BroadcastActivity < Temporalio::Activity::Definition
    def execute(params)
      Temporalio::Activity::Context.current.heartbeat("Broadcasting event to subscribers")

      organization_id = params["organization_id"]
      tool_event_id = params["tool_event_id"]
      classification = params["classification"]

      api_url = ENV.fetch("RAILS_API_URL", "http://localhost:3000")
      api_key = ENV.fetch("INTERNAL_API_KEY", nil)

      # Broadcast via Rails ActionCable endpoint
      result = broadcast_event(
        api_url: api_url,
        api_key: api_key,
        organization_id: organization_id,
        tool_event_id: tool_event_id,
        classification: classification
      )

      {
        "broadcasted" => result["success"],
        "channel" => "events:#{organization_id}",
        "broadcasted_at" => Time.now.utc.iso8601
      }
    end

    private

    def broadcast_event(api_url:, api_key:, organization_id:, tool_event_id:, classification:)
      uri = URI("#{api_url}/api/internal/broadcasts")
      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl = uri.scheme == "https"

      request = Net::HTTP::Post.new(uri)
      request["Authorization"] = "Bearer #{api_key}" if api_key
      request["Content-Type"] = "application/json"
      request.body = {
        broadcast: {
          channel: "events:#{organization_id}",
          event: "new_event",
          data: {
            tool_event_id: tool_event_id,
            risk_level: classification["risk_level"],
            detection_summary: classification["detection_summary"]
          }
        }
      }.to_json

      response = http.request(request)

      if response.code.to_i == 200 || response.code.to_i == 201
        { "success" => true }
      else
        # Don't fail the workflow if broadcast fails - it's non-critical
        { "success" => false, "error" => response.body }
      end
    rescue => e
      { "success" => false, "error" => e.message }
    end
  end
end

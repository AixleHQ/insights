require "temporalio/activity"
require "net/http"
require "json"

module Activities
  class PersistenceActivity < Temporalio::Activity::Definition
    def execute(params)
      Temporalio::Activity::Context.current.heartbeat("Persisting event and audit log")

      event_params = params["event"]
      raw_event_key = params["raw_event_key"]
      organization_id = params["organization_id"]
      classification = params["classification"]
      sanitization = params["sanitization"]
      workflow_id = params["workflow_id"]

      api_url = ENV.fetch("RAILS_API_URL", "http://localhost:3000")
      api_key = ENV.fetch("INTERNAL_API_KEY", nil)

      # Create the tool event via internal API
      tool_event = create_tool_event(api_url, api_key, event_params, sanitization, classification)

      # Create the audit log
      audit_log = create_audit_log(
        api_url,
        api_key,
        tool_event_id: tool_event["id"],
        organization_id: organization_id,
        raw_event_key: raw_event_key,
        classification: classification,
        sanitization: sanitization,
        workflow_id: workflow_id
      )

      {
        "tool_event_id" => tool_event["id"],
        "audit_log_id" => audit_log["id"],
        "persisted_at" => Time.now.utc.iso8601
      }
    end

    private

    def create_tool_event(api_url, api_key, event_params, sanitization, classification = {})
      uri = URI("#{api_url}/api/internal/tool_events")
      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl = uri.scheme == "https"
      http.open_timeout = 5
      http.read_timeout = 10

      request = Net::HTTP::Post.new(uri)
      request["Authorization"] = "Bearer #{api_key}" if api_key
      request["Content-Type"] = "application/json"
      request.body = {
        tool_event: {
          organization_id: event_params["organization_id"],
          user_id: event_params["user_id"],
          project_id: event_params["project_id"],
          tool_name: event_params["tool_name"],
          event_type: event_params["event_type"],
          model: event_params["model"],
          tokens_in: event_params["tokens_in"],
          tokens_out: event_params["tokens_out"],
          cost_usd: event_params["cost_usd"],
          duration_ms: event_params["duration_ms"],
          occurred_at: event_params["occurred_at"],
          metadata: metadata_from_sanitized(sanitization, event_params, classification)
        }
      }.to_json

      response = http.request(request)

      unless response.code.to_i == 201
        raise "Failed to create tool event (HTTP #{response.code}): #{response.body}"
      end

      JSON.parse(response.body)["data"]
    end

    def metadata_from_sanitized(sanitization, event_params, classification = {})
      base = event_params["metadata"].is_a?(Hash) ? event_params["metadata"].dup : {}

      envelope = parse_jsonish(sanitization["sanitized_payload"])
      if envelope.is_a?(Hash)
        overlay = envelope["metadata"]
        if overlay.nil?
          overlay = envelope.slice("commit_hash", "commit_message", "repo_name",
                                   "branch_name", "ai_percentage", "source")
        end
        base.merge!(overlay) if overlay.is_a?(Hash)
      end

      base.merge(
        "sanitization_applied" => sanitization["change_count"].to_i > 0,
        "original_size" => sanitization["original_size"],
        "sanitized_size" => sanitization["sanitized_size"],
        "risk_level" => (classification || {})["risk_level"] || "none",
        "risk_score" => (classification || {})["risk_score"].to_i
      )
    end

    def parse_jsonish(value)
      parsed = case value
      when String
        JSON.parse(value)
      when Hash
        value
      else
        {}
      end
      parsed = JSON.parse(parsed) if parsed.is_a?(String)
      parsed
    rescue JSON::ParserError
      {}
    end

    def create_audit_log(api_url, api_key, tool_event_id:, organization_id:, raw_event_key:, classification:, sanitization:, workflow_id:)
      uri = URI("#{api_url}/api/internal/audit_logs")
      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl = uri.scheme == "https"
      http.open_timeout = 5
      http.read_timeout = 10

      request = Net::HTTP::Post.new(uri)
      request["Authorization"] = "Bearer #{api_key}" if api_key
      request["Content-Type"] = "application/json"
      # Extract classification labels from detections
      classification_labels = (classification["detections"] || []).map do |d|
        "#{d['category']}/#{d['pattern']}"
      end.uniq

      # Extract sanitization actions from changes
      sanitization_actions = (sanitization["changes"] || []).map do |c|
        c["action"]
      end.uniq

      request.body = {
        audit_log: {
          tool_event_id: tool_event_id,
          organization_id: organization_id,
          raw_event_key: raw_event_key,
          risk_level: classification["risk_level"],
          temporal_workflow_id: workflow_id,
          classification_labels: classification_labels,
          sanitization_actions: sanitization_actions,
          confidence_score: [classification["risk_score"].to_f / 10.0, 1.0].min, # Normalize to 0-1, cap at 1
          metadata: {
            "risk_score" => classification["risk_score"],
            "detections" => classification["detections"],
            "detection_summary" => classification["detection_summary"],
            "sanitization_changes" => sanitization["changes"],
            "change_count" => sanitization["change_count"]
          }
        }
      }.to_json

      response = http.request(request)

      unless response.code.to_i == 201
        raise "Failed to create audit log (HTTP #{response.code}): #{response.body}"
      end

      JSON.parse(response.body)["data"]
    end
  end
end

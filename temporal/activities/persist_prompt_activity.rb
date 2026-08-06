require "temporalio/activity"
require "net/http"
require "json"

module Activities
  class PersistPromptActivity < Temporalio::Activity::Definition
    def execute(params)
      Temporalio::Activity::Context.current.heartbeat("Persisting prompt text")

      # Cheap short-circuit: skip the HTTP call when flag is off.
      # The Rails service is the authoritative gate — defense in depth.
      return { "captured" => false } unless prompt_capture_enabled?

      tool_event_id = params["tool_event_id"]
      occurred_at   = params["occurred_at"]
      sanitization  = params["sanitization"] || {}
      policy        = params["policy"] || {}

      sanitized_payload = parse_jsonish(sanitization["sanitized_payload"])
      metadata = sanitized_payload.is_a?(Hash) ? sanitized_payload["metadata"] : nil

      user_text      = metadata.is_a?(Hash) ? metadata["prompt_text"] : nil
      assistant_text = metadata.is_a?(Hash) ? metadata["assistant_text"] : nil

      return { "captured" => false } if user_text.nil? && assistant_text.nil?

      sanitizer_version = policy["version"]&.to_s

      post_to_rails(
        tool_event_id: tool_event_id,
        occurred_at: occurred_at,
        user_text: user_text,
        assistant_text: assistant_text,
        sanitizer_version: sanitizer_version
      )
    end

    private

    def prompt_capture_enabled?
      val = ENV.fetch("AIXLE_INSIGHTS_PROMPT_CAPTURE", "false")
      val.to_s.downcase == "true" || val == "1"
    end

    def post_to_rails(tool_event_id:, occurred_at:, user_text:, assistant_text:, sanitizer_version:)
      api_url = ENV.fetch("RAILS_API_URL", "http://localhost:3000")
      api_key = ENV.fetch("INTERNAL_API_KEY", nil)

      uri = URI("#{api_url}/api/internal/event_texts")
      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl = uri.scheme == "https"
      http.open_timeout = 5
      http.read_timeout = 10

      request = Net::HTTP::Post.new(uri)
      request["Authorization"] = "Bearer #{api_key}" if api_key
      request["Content-Type"] = "application/json"
      request.body = {
        event_text: {
          tool_event_id: tool_event_id,
          occurred_at: occurred_at,
          user_text: user_text,
          assistant_text: assistant_text,
          sanitizer_version: sanitizer_version
        }
      }.to_json

      response = http.request(request)

      unless [ 200, 201 ].include?(response.code.to_i)
        raise "Failed to persist prompt text: HTTP #{response.code} — #{response.body}"
      end

      JSON.parse(response.body)
    end

    def parse_jsonish(value)
      case value
      when String
        JSON.parse(value)
      when Hash
        value
      else
        {}
      end
    rescue JSON::ParserError
      {}
    end
  end
end

require "temporalio/activity"
require "net/http"
require "json"

module Activities
  class GetPolicyActivity < Temporalio::Activity::Definition
    # Default sanitization rules when no policy is configured
    DEFAULT_POLICY = {
      "id" => "default",
      "version" => 2,
      "rules" => {
        "pii" => {
          "enabled" => true,
          "action" => "redact",
          "patterns" => {
            "email" => '\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b',
            "phone" => '\b\d{3}[-.]?\d{3}[-.]?\d{4}\b',
            "ssn" => '\b\d{3}-\d{2}-\d{4}\b',
            "credit_card" => '\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b'
          }
        },
        "secrets" => {
          "enabled" => true,
          "action" => "redact",
          "patterns" => {
            "aws_access_key"  => 'AKIA[0-9A-Z]{16}',
            "aws_session_key" => 'ASIA[0-9A-Z]{16}',
            "github_token"    => 'gh[pousr]_[A-Za-z0-9_]{36,}',
            "openai_key"      => 'sk-[A-Za-z0-9]{48}',
            "anthropic_key"   => 'sk-ant-[A-Za-z0-9_\-]{93,}',
            "slack_token"     => 'xox[baprs]-[0-9A-Za-z\-]{10,}',
            "stripe_key"      => '(?:sk|rk)_live_[0-9a-zA-Z]{24,}',
            "google_api_key"  => 'AIza[0-9A-Za-z_\-]{35}',
            "jwt"             => 'eyJ[A-Za-z0-9_\-]*\.eyJ[A-Za-z0-9_\-]*\.[A-Za-z0-9_\-]*'
          }
        },
        "hipaa" => {
          "enabled" => false,
          "action" => "redact",
          "patterns" => {
            "medical_record" => 'MRN[:\s]*\d{6,}',
            "diagnosis_code" => '\b[A-Z]\d{2}\.?\d{0,2}\b'
          }
        }
      },
      "risk_thresholds" => {
        "low" => 0,
        "medium" => 1,
        "high" => 3,
        "critical" => 5
      }
    }.freeze

    def execute(params)
      Temporalio::Activity::Context.current.heartbeat("Fetching sanitization policy")

      organization_id = params["organization_id"]

      # Try to fetch from Rails API
      policy = fetch_from_api(organization_id)
      return policy if policy

      # Fall back to default policy
      DEFAULT_POLICY.dup
    end

    private

    def fetch_from_api(organization_id)
      api_url = ENV.fetch("RAILS_API_URL", "http://localhost:3000")
      api_key = ENV.fetch("INTERNAL_API_KEY", nil)

      return nil unless api_key

      uri = URI("#{api_url}/api/internal/organizations/#{organization_id}/sanitization_policy")
      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl = uri.scheme == "https"

      request = Net::HTTP::Get.new(uri)
      request["Authorization"] = "Bearer #{api_key}"
      request["Content-Type"] = "application/json"

      response = http.request(request)

      return nil unless response.code.to_i == 200

      JSON.parse(response.body)["data"]
    rescue => e
      Temporalio::Activity::Context.current.heartbeat("Failed to fetch policy: #{e.message}")
      nil
    end
  end
end

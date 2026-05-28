require 'rails_helper'

require_relative '../../../../../temporal/activities/sanitization_activity'

RSpec.describe Activities::SanitizationActivity, type: :unit do
  subject(:activity) { described_class.new }

  let(:activity_context) { instance_double(Temporalio::Activity::Context, heartbeat: nil) }

  before do
    allow(Temporalio::Activity::Context).to receive(:current).and_return(activity_context)
  end

  let(:default_policy) do
    {
      "rules" => {
        "secrets" => {
          "enabled" => true,
          "action" => "redact",
          "patterns" => {
            "api_key" => '(?i)api[_-]?key\s*=\s*[a-zA-Z0-9_-]{20,}'
          }
        }
      }
    }
  end

  describe "CUR-V16 — metadata.commit_message redaction" do
    let(:fake_key) { "sk_live_" + "EXAMPLEEXAMPLEEXAMPLEexampleexample" }
    let(:raw_payload) do
      {
        "tool_name" => "cursor",
        "event_type" => "commit",
        "metadata" => {
          "scannable" => false,
          "source" => "recent_commit",
          "commit_hash" => "cur-v16-sanitize-deadbeef",
          "commit_message" => "chore: rotate api_key=#{fake_key} before deploy"
        }
      }
    end

    it "redacts the API key in commit_message when classification requires sanitization" do
      result = activity.execute(
        "raw_payload" => JSON.generate(raw_payload),
        "policy" => default_policy,
        "classification" => { "requires_sanitization" => true }
      )

      parsed = JSON.parse(result["sanitized_payload"])
      message = parsed.dig("metadata", "commit_message")

      expect(message).not_to include(fake_key)
      expect(message).to include("[REDACTED]")
      expect(result["change_count"]).to be > 0
    end

    it "returns payload unchanged when classification does not require sanitization" do
      result = activity.execute(
        "raw_payload" => JSON.generate(raw_payload),
        "policy" => default_policy,
        "classification" => { "requires_sanitization" => false }
      )

      parsed = JSON.parse(result["sanitized_payload"])
      expect(parsed.dig("metadata", "commit_message")).to include(fake_key)
      expect(result["changes"]).to eq([])
    end
  end
end

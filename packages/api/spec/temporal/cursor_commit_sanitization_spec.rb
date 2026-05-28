require 'rails_helper'

require_relative '../../../../temporal/activities/classification_activity'
require_relative '../../../../temporal/activities/sanitization_activity'

# CUR-V16 — end-to-end classification → sanitization for cursor commit metadata.
RSpec.describe "Cursor commit metadata sanitization (CUR-V16)", type: :unit do
  let(:classification) { Activities::ClassificationActivity.new }
  let(:sanitization) { Activities::SanitizationActivity.new }

  let(:activity_context) { instance_double(Temporalio::Activity::Context, heartbeat: nil) }

  before do
    allow(Temporalio::Activity::Context).to receive(:current).and_return(activity_context)
  end

  let(:policy) do
    {
      "rules" => {
        "secrets" => {
          "enabled" => true,
          "action" => "redact",
          "patterns" => {
            "api_key" => '(?i)api[_-]?key\s*=\s*[a-zA-Z0-9_-]{20,}'
          }
        }
      },
      "risk_thresholds" => { "medium" => 1, "high" => 3, "critical" => 5 }
    }
  end

  let(:fake_key) { "sk_live_" + "EXAMPLEEXAMPLEEXAMPLEexampleexample" }
  let(:raw_payload) do
    JSON.generate(
      tool_name: "cursor",
      event_type: "commit",
      metadata: {
        scannable: false,
        source: "recent_commit",
        commit_hash: "cur-v16-pipeline-deadbeef",
        commit_message: "chore: rotate api_key=#{fake_key} before deploy",
        risk_level: "none"
      }
    )
  end

  it "classifies then redacts commit_message before persistence would run" do
    classification_result = classification.execute(
      "raw_payload" => raw_payload,
      "policy" => policy
    )

    expect(classification_result["requires_sanitization"]).to be true

    sanitization_result = sanitization.execute(
      "raw_payload" => raw_payload,
      "policy" => policy,
      "classification" => classification_result
    )

    message = JSON.parse(sanitization_result["sanitized_payload"]).dig("metadata", "commit_message")
    expect(message).not_to include(fake_key)
    expect(message).to include("[REDACTED]")
  end
end

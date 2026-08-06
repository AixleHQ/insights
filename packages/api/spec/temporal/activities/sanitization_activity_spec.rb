require 'rails_helper'

require_relative '../../../../../temporal/activities/sanitization_activity'
require_relative '../../../../../temporal/activities/get_policy_activity'

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

  describe "generic api_key pattern does not clobber non-secret session identifiers" do
    let(:default_policy) do
      {
        "rules" => {
          "secrets" => {
            "enabled" => true,
            "action" => "redact",
            "patterns" => Activities::GetPolicyActivity::DEFAULT_POLICY["rules"]["secrets"]["patterns"]
          }
        }
      }
    end
    let(:raw_payload) do
      {
        "tool_name" => "cursor",
        "event_type" => "chat",
        "metadata" => {
          "scannable" => true,
          "session_id" => "300373e4-b3de-42cf-8ffb-15e255ea1b78:3",
          "cursor_session_id" => "300373e4-b3de-42cf-8ffb-15e255ea1b78",
          "prompt_text" => "npm login failed with token sk-proj-#{'a' * 30}"
        }
      }
    end

    it "leaves Cursor's uuid-based session_id/cursor_session_id untouched while still redacting the real secret" do
      result = activity.execute(
        "raw_payload" => JSON.generate(raw_payload),
        "policy" => default_policy,
        "classification" => { "requires_sanitization" => true }
      )

      parsed = JSON.parse(result["sanitized_payload"])

      expect(parsed.dig("metadata", "session_id")).to eq("300373e4-b3de-42cf-8ffb-15e255ea1b78:3")
      expect(parsed.dig("metadata", "cursor_session_id")).to eq("300373e4-b3de-42cf-8ffb-15e255ea1b78")
      expect(parsed.dig("metadata", "prompt_text")).not_to include("sk-proj-")
      expect(parsed.dig("metadata", "prompt_text")).to include("[REDACTED]")
    end
  end

  describe "AIX-263 QA — phone pattern widened to catch parenthesized/international formats" do
    let(:default_policy) do
      {
        "rules" => {
          "pii" => {
            "enabled" => true,
            "action" => "redact",
            "patterns" => Activities::GetPolicyActivity::DEFAULT_POLICY["rules"]["pii"]["patterns"]
          }
        }
      }
    end

    it "redacts a parenthesized US phone number" do
      raw_payload = { "metadata" => { "prompt_text" => "call me at (555) 987-6543 later" } }

      result = activity.execute(
        "raw_payload" => JSON.generate(raw_payload),
        "policy" => default_policy,
        "classification" => { "requires_sanitization" => true }
      )

      text = JSON.parse(result["sanitized_payload"]).dig("metadata", "prompt_text")
      expect(text).not_to include("987-6543")
      expect(text).to include("[REDACTED]")
    end

    it "redacts an international spaced phone number" do
      raw_payload = { "metadata" => { "prompt_text" => "ring +44 7700 900123 tomorrow" } }

      result = activity.execute(
        "raw_payload" => JSON.generate(raw_payload),
        "policy" => default_policy,
        "classification" => { "requires_sanitization" => true }
      )

      text = JSON.parse(result["sanitized_payload"]).dig("metadata", "prompt_text")
      expect(text).not_to include("7700 900123")
      expect(text).to include("[REDACTED]")
    end

    it "still fully redacts a 16-digit credit card number rather than leaving a trailing group" do
      raw_payload = { "metadata" => { "prompt_text" => "card 4111 1111 1111 1111 on file" } }

      result = activity.execute(
        "raw_payload" => JSON.generate(raw_payload),
        "policy" => default_policy,
        "classification" => { "requires_sanitization" => true }
      )

      text = JSON.parse(result["sanitized_payload"]).dig("metadata", "prompt_text")
      expect(text).not_to include("1111")
    end

    it "leaves an SSN for the dedicated ssn pattern rather than partially matching it as a phone" do
      raw_payload = { "metadata" => { "prompt_text" => "ssn on file: 123-45-6789" } }

      result = activity.execute(
        "raw_payload" => JSON.generate(raw_payload),
        "policy" => default_policy,
        "classification" => { "requires_sanitization" => true }
      )

      text = JSON.parse(result["sanitized_payload"]).dig("metadata", "prompt_text")
      expect(text).to include("[REDACTED]")
      expect(text).not_to match(/\d{3}-\d{2}-\d{4}/)
    end
  end
end

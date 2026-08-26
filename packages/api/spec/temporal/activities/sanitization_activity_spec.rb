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

  describe "AIX-541 — NON_CONTENT_KEYS exempts project_id/organization_id/user_id from secret redaction" do
    let(:secrets_only_policy) do
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
    let(:github_token) { "ghp_" + "A" * 36 }
    let(:raw_payload) do
      {
        "organization_id" => "4a9c1e2b-6f3d-4e11-9c2a-7b8d5e6f9a10",
        "user_id"         => "9d2f3a4b-5c6d-4e7f-8091-a2b3c4d5e6f7",
        "project_id"      => "300373e4-b3de-42cf-8ffb-15e255ea1b78",
        "metadata" => {
          "prompt_text" => "npm publish failed, rotate token #{github_token}"
        }
      }
    end

    it "leaves project_id/organization_id/user_id UUIDs untouched while still redacting a real secret" do
      result = activity.execute(
        "raw_payload" => JSON.generate(raw_payload),
        "policy" => secrets_only_policy,
        "classification" => { "requires_sanitization" => true }
      )

      parsed = JSON.parse(result["sanitized_payload"])

      expect(parsed["organization_id"]).to eq("4a9c1e2b-6f3d-4e11-9c2a-7b8d5e6f9a10")
      expect(parsed["user_id"]).to eq("9d2f3a4b-5c6d-4e7f-8091-a2b3c4d5e6f7")
      expect(parsed["project_id"]).to eq("300373e4-b3de-42cf-8ffb-15e255ea1b78")
      expect(parsed.dig("metadata", "prompt_text")).to include("[REDACTED]")
      expect(parsed.dig("metadata", "prompt_text")).not_to include(github_token)

      redacted_paths = result["changes"].map { |c| c["path"] }
      expect(redacted_paths).not_to include("project_id", "organization_id", "user_id")
    end

    it "does not redact a UUID pasted into free-text content (generic api_key net retired in AIX-579)" do
      uuid = "300373e4-b3de-42cf-8ffb-15e255ea1b78"
      payload = { "metadata" => { "commit_message" => "rotated secret, old value was #{uuid}" } }

      result = activity.execute(
        "raw_payload" => JSON.generate(payload),
        "policy" => secrets_only_policy,
        "classification" => { "requires_sanitization" => true }
      )

      parsed = JSON.parse(result["sanitized_payload"])
      expect(parsed.dig("metadata", "commit_message")).to include(uuid)
      expect(parsed.dig("metadata", "commit_message")).not_to include("[REDACTED]")
    end

    it "exempts a structural id field even under a custom policy pattern that matches its value" do
      # DEFAULT_POLICY's anchored patterns never match a bare UUID, so the two tests
      # above can't distinguish "exempt by key" from "exempt because nothing matched
      # it anyway". This proves the guarantee is policy-independent: it holds even
      # when a (non-default) policy pattern would otherwise match the id's value.
      uuid_matching_policy = {
        "rules" => {
          "secrets" => {
            "enabled" => true,
            "action" => "redact",
            "patterns" => {
              "uuid_like" => '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
            }
          }
        }
      }
      project_id = "300373e4-b3de-42cf-8ffb-15e255ea1b78"
      content_uuid = "9d2f3a4b-5c6d-4e7f-8091-a2b3c4d5e6f7"
      payload = {
        "project_id" => project_id,
        "metadata" => { "commit_message" => "old value was #{content_uuid}" }
      }

      result = activity.execute(
        "raw_payload" => JSON.generate(payload),
        "policy" => uuid_matching_policy,
        "classification" => { "requires_sanitization" => true }
      )

      parsed = JSON.parse(result["sanitized_payload"])
      expect(parsed["project_id"]).to eq(project_id)
      expect(parsed.dig("metadata", "commit_message")).to include("[REDACTED]")
      expect(parsed.dig("metadata", "commit_message")).not_to include(content_uuid)

      redacted_paths = result["changes"].map { |c| c["path"] }
      expect(redacted_paths).to include("metadata.commit_message")
      expect(redacted_paths).not_to include("project_id")
    end
  end

  describe "AIX-541 — double-encoded payloads (no existing coverage on this branch)" do
    let(:uuid_matching_policy) do
      {
        "rules" => {
          "secrets" => {
            "enabled" => true,
            "action" => "redact",
            "patterns" => {
              "uuid_like" => '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
            }
          }
        }
      }
    end
    let(:project_id) { "300373e4-b3de-42cf-8ffb-15e255ea1b78" }
    let(:content_uuid) { "9d2f3a4b-5c6d-4e7f-8091-a2b3c4d5e6f7" }

    def deep_parse(str)
      value = JSON.parse(str)
      value = JSON.parse(value) while value.is_a?(String)
      value
    end

    it "unwraps a double-encoded payload and still exempts structural ids" do
      obj = { "project_id" => project_id, "metadata" => { "note" => "old #{content_uuid}" } }
      double_encoded = JSON.generate(JSON.generate(obj))

      result = activity.execute(
        "raw_payload" => double_encoded,
        "policy" => uuid_matching_policy,
        "classification" => { "requires_sanitization" => true }
      )

      parsed = deep_parse(result["sanitized_payload"])
      expect(parsed["project_id"]).to eq(project_id)
      expect(parsed.dig("metadata", "note")).to include("[REDACTED]")
      expect(parsed.dig("metadata", "note")).not_to include(content_uuid)
    end

    it "unwraps a triple-encoded payload" do
      obj = { "project_id" => project_id, "metadata" => { "note" => "old #{content_uuid}" } }
      triple_encoded = JSON.generate(JSON.generate(JSON.generate(obj)))

      result = activity.execute(
        "raw_payload" => triple_encoded,
        "policy" => uuid_matching_policy,
        "classification" => { "requires_sanitization" => true }
      )

      parsed = deep_parse(result["sanitized_payload"])
      expect(parsed["project_id"]).to eq(project_id)
      expect(parsed.dig("metadata", "note")).to include("[REDACTED]")
    end

    it "unwraps a double-encoded top-level array" do
      raw = JSON.generate(JSON.generate([ { "user_id" => project_id, "note" => "old #{content_uuid}" } ]))

      result = activity.execute(
        "raw_payload" => raw,
        "policy" => uuid_matching_policy,
        "classification" => { "requires_sanitization" => true }
      )

      parsed = deep_parse(result["sanitized_payload"])
      expect(parsed.first["user_id"]).to eq(project_id)
      expect(parsed.first["note"]).to include("[REDACTED]")
    end

    it "falls back to flat-string scanning when the inner layer is plain text, not further JSON" do
      raw = JSON.generate("secret #{content_uuid} here")

      result = activity.execute(
        "raw_payload" => raw,
        "policy" => uuid_matching_policy,
        "classification" => { "requires_sanitization" => true }
      )

      expect(result["sanitized_payload"]).to be_a(String)
      expect(JSON.parse(result["sanitized_payload"])).to include("[REDACTED]")
    end

    it "returns an empty-string payload untouched (loop terminates, no crash)" do
      result = activity.execute(
        "raw_payload" => "",
        "policy" => uuid_matching_policy,
        "classification" => { "requires_sanitization" => true }
      )

      expect(result["sanitized_payload"]).to eq("")
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

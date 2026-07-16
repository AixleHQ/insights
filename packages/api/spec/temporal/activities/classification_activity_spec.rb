require 'rails_helper'

require_relative '../../../../../temporal/activities/classification_activity'
require_relative '../../../../../temporal/activities/get_policy_activity'

RSpec.describe Activities::ClassificationActivity, type: :unit do
  subject(:activity) { described_class.new }

  let(:activity_context) { instance_double(Temporalio::Activity::Context, heartbeat: nil) }

  before do
    allow(Temporalio::Activity::Context).to receive(:current).and_return(activity_context)
  end

  # Minimal DEFAULT_POLICY-shape policy for Path 3 tests
  let(:default_policy) do
    {
      "rules" => {
        "pii" => {
          "enabled" => true,
          "action"  => "flag",
          "patterns" => {
            "email" => '[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}'
          }
        },
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

  describe "Path 1: unscannable (cursor) payload" do
    it "returns risk_level 'none' with empty detections when metadata has no secrets" do
      params = {
        "raw_payload" => JSON.generate({ "metadata" => { "scannable" => false } }),
        "policy"      => default_policy
      }

      result = activity.execute(params)

      expect(result["risk_level"]).to eq("none")
      expect(result["detections"]).to eq([])
      expect(result["requires_sanitization"]).to be false
      expect(result["risk_score"]).to eq(0)
    end

    # CUR-V16 — commit_message can embed credentials; metadata must still be scanned.
    it "flags metadata.commit_message containing a fake API key for sanitization" do
      fake_key = "sk_live_" + "EXAMPLEEXAMPLEEXAMPLEexampleexample"
      params = {
        "raw_payload" => JSON.generate({
          "tool_name" => "cursor",
          "event_type" => "commit",
          "metadata" => {
            "scannable" => false,
            "source" => "recent_commit",
            "commit_hash" => "cur-v16-classify-deadbeef",
            "commit_message" => "chore: rotate api_key=#{fake_key} before deploy"
          }
        }),
        "policy" => default_policy
      }

      result = activity.execute(params)

      expect(result["requires_sanitization"]).to be true
      expect(result["detections"]).not_to be_empty
      expect(result["detections"].first["category"]).to eq("secrets")
      expect(result["detections"].first["pattern"]).to eq("api_key")
    end
  end

  describe "Path 2: pre-scanned (db90-claude) payload" do
    it "returns the connector's result directly without server scan" do
      params = {
        "raw_payload" => JSON.generate({
          "metadata" => {
            "scannable"        => true,
            "risk_level"       => "high",
            "risk_categories"  => [ "secrets" ],
            "risk_score"       => 3
          }
        }),
        "policy" => default_policy
      }

      result = activity.execute(params)

      expect(result["risk_level"]).to eq("high")
      expect(result["risk_score"]).to eq(3)
      expect(result["requires_sanitization"]).to be false
      # Verify server scan was skipped — detections use "pre_scanned" pattern marker
      expect(result["detections"].first["pattern"]).to eq("pre_scanned")
      expect(result["detections"].first["category"]).to eq("secrets")
    end

    it "handles empty risk_categories gracefully" do
      params = {
        "raw_payload" => JSON.generate({
          "metadata" => {
            "scannable"       => true,
            "risk_level"      => "low",
            "risk_categories" => [],
            "risk_score"      => 0
          }
        }),
        "policy" => default_policy
      }

      result = activity.execute(params)

      expect(result["risk_level"]).to eq("low")
      expect(result["detections"]).to eq([])
      expect(result["detection_summary"]).to eq("No sensitive data detected")
    end
  end

  describe "Path 3: standard server-side scan (web events)" do
    it "scans payload text and detects email → medium risk" do
      params = {
        "raw_payload" => JSON.generate({
          "content" => "Please contact user@example.com for more information"
        }),
        "policy" => default_policy
      }

      result = activity.execute(params)

      expect(result["risk_level"]).to eq("medium")
      expect(result["detections"]).not_to be_empty
      expect(result["detections"].first["category"]).to eq("pii")
    end

    it "falls through to Path 3 when scannable is a string 'false' (strict boolean check)" do
      params = {
        "raw_payload" => JSON.generate({
          "metadata" => { "scannable" => "false" },
          "content"  => "user@example.com"
        }),
        "policy" => default_policy
      }

      # String "false" != boolean false — should NOT match Path 1, falls to Path 3
      result = activity.execute(params)

      expect(result["risk_level"]).not_to eq("none")
      expect(result["detections"]).not_to be_empty
    end
  end

  describe "Path 2: invalid risk_level passthrough guard" do
    it "falls back to 'low' when connector sends an unrecognised risk_level" do
      params = {
        "raw_payload" => JSON.generate({
          "metadata" => {
            "scannable"       => true,
            "risk_level"      => "INJECTED_VALUE",
            "risk_categories" => [],
            "risk_score"      => 0
          }
        }),
        "policy" => default_policy
      }

      result = activity.execute(params)

      expect(result["risk_level"]).to eq("low")
    end
  end

  describe "Path 3: real DEFAULT_POLICY — false-positive regression suite" do
    # Deep copy so mutations in tests don't affect the frozen constant
    let(:real_policy) { JSON.parse(JSON.generate(Activities::GetPolicyActivity::DEFAULT_POLICY)) }

    def classify(content)
      activity.execute(
        "raw_payload" => JSON.generate({ "content" => content }),
        "policy"      => real_policy
      )
    end

    it "benign Russian text scores low (live false-positive case)" do
      result = classify("Help me resolve the conflict")
      expect(result["risk_level"]).to eq("low")
      expect(result["detections"]).to be_empty
    end

    it "UUID in session_id field is not flagged" do
      result = activity.execute(
        "raw_payload" => JSON.generate({
          "metadata" => { "scannable" => false },
          "session_id" => "550e8400-e29b-41d4-a716-446655440000"
        }),
        "policy" => real_policy
      )
      expect(result["risk_level"]).to eq("none")
      expect(result["detections"]).to be_empty
    end

    it "40-char git SHA in commit_hash field is not flagged" do
      result = activity.execute(
        "raw_payload" => JSON.generate({
          "metadata" => {
            "scannable" => false,
            "commit_hash" => "a" * 40
          }
        }),
        "policy" => real_policy
      )
      expect(result["risk_level"]).to eq("none")
      expect(result["detections"]).to be_empty
    end

    it "base64 blob in content without provider prefix is not flagged" do
      # 44-char base64 with no real secret prefix
      blob = "dGhpcyBpcyBub3QgYSBzZWNyZXQgYXQgYWxs"
      result = classify("Encode this: #{blob}")
      expect(result["risk_level"]).to eq("low")
      expect(result["detections"]).to be_empty
    end

    it "real AWS access key in prompt is detected at high or critical" do
      result = classify("My key is AKIAIOSFODNN7EXAMPLEKEY and should be secret")
      expect(result["risk_level"]).to be_in(%w[high critical])
      detection = result["detections"].find { |d| d["pattern"] == "aws_access_key" }
      expect(detection).not_to be_nil
    end

    it "real GitHub personal token in prompt is detected at high or critical" do
      token = "ghp_" + "A" * 36
      result = classify("Token: #{token}")
      expect(result["risk_level"]).to be_in(%w[high critical])
      detection = result["detections"].find { |d| d["pattern"] == "github_token" }
      expect(detection).not_to be_nil
    end

    it "JWT in prompt is detected" do
      jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"
      result = classify("Authorization: Bearer #{jwt}")
      detection = result["detections"].find { |d| d["pattern"] == "jwt" }
      expect(detection).not_to be_nil
    end

    it "same GitHub token repeated 5 times scores once (deduplication)" do
      token = "ghp_" + "B" * 36
      result = classify(([ token ] * 5).join(" "))
      detection = result["detections"].find { |d| d["pattern"] == "github_token" }
      expect(detection).not_to be_nil
      expect(detection["count"]).to eq(1)
      # score = weight(3) * unique_count(1) = 3, not 15
      expect(result["risk_score"]).to eq(3)
    end

    it "benign prompt never triggers high or critical (alert regression gate)" do
      benign_prompts = [
        "Help me resolve the conflict",
        "How do I fix this merge conflict?",
        "refactor the auth module please",
        "what does this function do?"
      ]
      benign_prompts.each do |prompt|
        result = classify(prompt)
        expect(result["risk_level"]).not_to be_in(%w[high critical]),
          "Expected '#{prompt}' to not be high/critical but got #{result['risk_level']}"
      end
    end
  end
end

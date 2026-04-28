require 'rails_helper'

# Pre-register so `require "temporalio/activity"` is a no-op (gem not in Rails bundle)
$LOADED_FEATURES << "temporalio/activity" unless $LOADED_FEATURES.include?("temporalio/activity")

# Stub the constants the activity uses — guard on the specific class to handle
# full-suite runs where Temporalio module may be partially defined by another spec
unless defined?(Temporalio::Activity::Definition)
  module Temporalio
    module Activity
      class Definition; end
      class Context
        def self.current = new
        def heartbeat(*); end
      end
    end
  end
end

require_relative '../../../../../temporal/activities/classification_activity'

RSpec.describe Activities::ClassificationActivity, type: :unit do
  subject(:activity) { described_class.new }

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
        }
      },
      "risk_thresholds" => { "medium" => 1, "high" => 3, "critical" => 5 }
    }
  end

  describe "Path 1: unscannable (cursor) payload" do
    it "returns risk_level 'none' with empty detections" do
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
end

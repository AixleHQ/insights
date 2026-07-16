require 'rails_helper'
require_relative '../../../../../temporal/activities/get_policy_activity'

RSpec.describe Activities::GetPolicyActivity, type: :unit do
  describe "DEFAULT_POLICY" do
    subject(:policy) { described_class::DEFAULT_POLICY }

    it "has version 2" do
      expect(policy["version"]).to eq(2)
    end

    it "does not contain the generic api_key catch-all pattern" do
      secret_patterns = policy.dig("rules", "secrets", "patterns") || {}
      expect(secret_patterns).not_to have_key("api_key")
    end

    it "contains all expected anchored secret pattern keys" do
      secret_patterns = policy.dig("rules", "secrets", "patterns") || {}
      expected_keys = %w[
        aws_access_key aws_session_key github_token
        openai_key anthropic_key slack_token
        stripe_key google_api_key jwt
      ]
      expect(secret_patterns.keys).to match_array(expected_keys)
    end

    it "aws_access_key matches a real AWS IAM key prefix" do
      regex = Regexp.new(policy.dig("rules", "secrets", "patterns", "aws_access_key"), Regexp::IGNORECASE)
      expect("AKIAIOSFODNN7EXAMPLEKEY").to match(regex)
      expect("AKIAIOSFODNN7EXAMPLEKEY").to match(regex)
    end

    it "aws_session_key matches a real STS key prefix" do
      regex = Regexp.new(policy.dig("rules", "secrets", "patterns", "aws_session_key"), Regexp::IGNORECASE)
      expect("ASIAIOSFODNN7EXAMPLEKEY").to match(regex)
    end

    it "github_token matches gh[pousr]_ prefixed tokens" do
      regex = Regexp.new(policy.dig("rules", "secrets", "patterns", "github_token"), Regexp::IGNORECASE)
      expect("ghp_" + "a" * 36).to match(regex)
      expect("gho_" + "a" * 36).to match(regex)
      expect("ghu_" + "a" * 36).to match(regex)
    end

    it "openai_key matches sk- prefixed tokens of correct length" do
      regex = Regexp.new(policy.dig("rules", "secrets", "patterns", "openai_key"), Regexp::IGNORECASE)
      expect("sk-" + "a" * 48).to match(regex)
    end

    it "anthropic_key matches sk-ant- prefixed tokens" do
      regex = Regexp.new(policy.dig("rules", "secrets", "patterns", "anthropic_key"), Regexp::IGNORECASE)
      expect("sk-ant-" + "a" * 93).to match(regex)
    end

    it "slack_token matches xox[baprs]- prefixed tokens" do
      regex = Regexp.new(policy.dig("rules", "secrets", "patterns", "slack_token"), Regexp::IGNORECASE)
      expect("xoxb-123456789012-abcdefghijk").to match(regex)
      expect("xoxp-123456789012-abcdefghijk").to match(regex)
    end

    it "stripe_key matches sk_live_ and rk_live_ prefixed tokens" do
      regex = Regexp.new(policy.dig("rules", "secrets", "patterns", "stripe_key"), Regexp::IGNORECASE)
      expect("sk_live_" + "a" * 24).to match(regex)
      expect("rk_live_" + "a" * 24).to match(regex)
    end

    it "google_api_key matches AIza prefixed tokens" do
      regex = Regexp.new(policy.dig("rules", "secrets", "patterns", "google_api_key"), Regexp::IGNORECASE)
      expect("AIza" + "a" * 35).to match(regex)
    end

    it "jwt matches eyJ...eyJ...sig shaped tokens" do
      regex = Regexp.new(policy.dig("rules", "secrets", "patterns", "jwt"), Regexp::IGNORECASE)
      expect("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c").to match(regex)
    end

    it "aws_access_key does NOT match a UUID" do
      regex = Regexp.new(policy.dig("rules", "secrets", "patterns", "aws_access_key"), Regexp::IGNORECASE)
      expect("550e8400-e29b-41d4-a716-446655440000").not_to match(regex)
    end

    it "github_token does NOT match a 40-char git SHA" do
      regex = Regexp.new(policy.dig("rules", "secrets", "patterns", "github_token"), Regexp::IGNORECASE)
      expect("a" * 40).not_to match(regex)
    end
  end
end

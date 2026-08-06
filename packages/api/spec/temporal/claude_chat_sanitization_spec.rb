require 'rails_helper'

require_relative '../../../../temporal/activities/classification_activity'
require_relative '../../../../temporal/activities/sanitization_activity'
require_relative '../../../../temporal/activities/get_policy_activity'

# AIX-363 — end-to-end classification → sanitization for Claude chat prompt/assistant text.
#
# Decisive Fork resolution: Claude reader (claude.ts) always emits scannable=true + risk_level,
# which causes ClassificationActivity to take Path 2. Previously Path 2 returned
# requires_sanitization=false unconditionally, so the sanitizer never ran on prompt/assistant
# text. This spec proves the fork is fixed: Path 2 now scans prompt_text/assistant_text
# from the metadata and sets requires_sanitization=true when secrets are found.
RSpec.describe "Claude chat prompt/assistant text sanitization (AIX-363)", type: :unit do
  let(:classification) { Activities::ClassificationActivity.new }
  let(:sanitization)   { Activities::SanitizationActivity.new }

  let(:activity_context) { instance_double(Temporalio::Activity::Context, heartbeat: nil) }

  before do
    allow(Temporalio::Activity::Context).to receive(:current).and_return(activity_context)
  end

  let(:policy) { Activities::GetPolicyActivity::DEFAULT_POLICY.dup }

  # Builds a Claude-style payload (scannable=true + risk_level always set by claude.ts).
  def claude_payload(prompt_text: "", assistant_text: "", risk_level: "low")
    JSON.generate(
      tool_name: "claude_code",
      event_type: "chat",
      metadata: {
        scannable: true,
        risk_level: risk_level,
        risk_score: 0,
        risk_categories: [],
        prompt_text: prompt_text.presence,
        assistant_text: assistant_text.presence
      }.compact
    )
  end

  # ──────────────────────────────────────────────────────────────────────────────
  # Decisive Fork: Path 2 now forces server scan when text is present
  # ──────────────────────────────────────────────────────────────────────────────

  describe "Decisive Fork (AC 1)" do
    it "Path 2 triggers server-side scan and sets requires_sanitization=true when prompt contains a secret" do
      raw = claude_payload(prompt_text: "My key is sk-ant-api03-EXAMPLEEXAMPLEEXAMPLEexample")

      result = classification.execute("raw_payload" => raw, "policy" => policy)

      expect(result["requires_sanitization"]).to be true
      expect(result["detections"]).not_to be_empty
    end

    it "Path 2 returns requires_sanitization=false when prompt has no secrets" do
      raw = claude_payload(prompt_text: "Please explain how Ruby blocks work.")

      result = classification.execute("raw_payload" => raw, "policy" => policy)

      expect(result["requires_sanitization"]).to be false
    end

    it "Path 2 preserves the client risk_level even when text scan finds nothing new" do
      raw = claude_payload(prompt_text: "Normal prompt.", risk_level: "high")

      result = classification.execute("raw_payload" => raw, "policy" => policy)

      expect(result["risk_level"]).to eq("high")
    end

    it "Path 2 escalates risk_level when text scan finds something worse than client reported" do
      raw = claude_payload(prompt_text: "Here is my key: sk-ant-api03-EXAMPLEEXAMPLEEXAMPLEexample", risk_level: "low")

      result = classification.execute("raw_payload" => raw, "policy" => policy)

      expect(result["requires_sanitization"]).to be true
      # Secrets category weight 3 per detection → risk_score >= 3 → at least "high"
      expect(%w[high critical]).to include(result["risk_level"])
    end
  end

  # ──────────────────────────────────────────────────────────────────────────────
  # Token redaction: prove each provider token is redacted end-to-end (AC 3–6)
  # ──────────────────────────────────────────────────────────────────────────────

  shared_examples "redacted end-to-end" do |description, prompt, matcher|
    it description do
      raw = claude_payload(prompt_text: prompt)

      classification_result = classification.execute("raw_payload" => raw, "policy" => policy)
      expect(classification_result["requires_sanitization"]).to be(true),
        "expected classification to require sanitization for: #{prompt.inspect}"

      sanitization_result = sanitization.execute(
        "raw_payload" => raw,
        "policy" => policy,
        "classification" => classification_result
      )

      sanitized_metadata = JSON.parse(sanitization_result["sanitized_payload"])["metadata"]
      sanitized_text = [ sanitized_metadata["prompt_text"], sanitized_metadata["assistant_text"] ].join(" ")

      instance_exec(sanitized_text, &matcher)
    end
  end

  describe "Anthropic API key redaction (AC 3)" do
    include_examples "redacted end-to-end",
      "redacts a full-length sk-ant- token (realistic 64+ chars)",
      "Use this key: sk-ant-api03-EXAMPLEEXAMPLEEXAMPLEEXAMPLEexampleexample",
      ->(text) {
        expect(text).not_to include("sk-ant-api03-")
        expect(text).to include("[REDACTED]")
      }

    include_examples "redacted end-to-end",
      "redacts a short sk-ant- token (<32 chars — generic net misses this)",
      "Key: sk-ant-api03-EXAMPLEEXAMPLE12",
      ->(text) {
        expect(text).not_to include("sk-ant-api03-")
        expect(text).to include("[REDACTED]")
      }
  end

  describe "OpenAI API key redaction (AC 3)" do
    include_examples "redacted end-to-end",
      "redacts sk- token",
      "OpenAI key: sk-EXAMPLEEXAMPLEEXAMPLEexampleexample",
      ->(text) {
        expect(text).not_to include("sk-EXAMPLEEXAMPLEEXAMPLEexample")
        expect(text).to include("[REDACTED]")
      }

    include_examples "redacted end-to-end",
      "redacts sk-proj- token",
      "Project key: sk-proj-EXAMPLEEXAMPLEEXAMPLEexampleexample",
      ->(text) {
        expect(text).not_to include("sk-proj-EXAMPLEEXAMPLEEXAMPLEexample")
        expect(text).to include("[REDACTED]")
      }

    include_examples "redacted end-to-end",
      "redacts a short sk- token (<32 chars — generic net misses this)",
      "Key: sk-EXAMPLEEXAMPLE1234567",
      ->(text) {
        expect(text).not_to include("sk-EXAMPLEEXAMPLE1234567")
        expect(text).to include("[REDACTED]")
      }
  end

  describe "GitHub token redaction (AC 4)" do
    include_examples "redacted end-to-end",
      "redacts ghp_ (Personal Access Token)",
      "GitHub PAT: ghp_EXAMPLEEXAMPLEEXAMPLEexampleexample",
      ->(text) {
        expect(text).not_to include("ghp_EXAMPLEEXAMPLEEXAMPLEexample")
        expect(text).to include("[REDACTED]")
      }

    include_examples "redacted end-to-end",
      "redacts ghs_ (GitHub Actions token)",
      "Actions token: ghs_EXAMPLEEXAMPLEexample1234567",
      ->(text) {
        expect(text).not_to include("ghs_EXAMPLEEXAMPLEexample1234567")
        expect(text).to include("[REDACTED]")
      }

    include_examples "redacted end-to-end",
      "redacts a short ghp_ token (previously leaked under 36-char floor)",
      "Short PAT: ghp_EXAMPLEEXAMPLE1234567890",
      ->(text) {
        expect(text).not_to include("ghp_EXAMPLEEXAMPLE1234567890")
        expect(text).to include("[REDACTED]")
      }
  end

  describe "Slack token redaction (AC 4)" do
    include_examples "redacted end-to-end",
      "redacts xoxb- (bot token)",
      "Slack bot: xoxb-EXAMPLEEXAMPLEexample",
      ->(text) {
        expect(text).not_to include("xoxb-EXAMPLEEXAMPLEexample")
        expect(text).to include("[REDACTED]")
      }

    include_examples "redacted end-to-end",
      "redacts xoxp- (user token)",
      "Slack user: xoxp-EXAMPLE-EXAMPLE-exampletoken",
      ->(text) {
        expect(text).not_to include("xoxp-EXAMPLE-EXAMPLE")
        expect(text).to include("[REDACTED]")
      }
  end

  # The unlabeled aws_secret pattern (AC 5 in the original AIX-363 story) was retired
  # alongside the generic api_key net (AIX-579): a bare [A-Za-z0-9/+=]{40} heuristic
  # over-redacted ordinary base64 blobs and data URIs with no reliable way to tell them
  # apart from a real secret. Only the AKIA-prefixed access key ID (which has an
  # unambiguous format) is still redacted.
  describe "AWS secret key redaction" do
    def sanitize_prompt(prompt)
      raw = claude_payload(prompt_text: prompt)
      classification_result = classification.execute("raw_payload" => raw, "policy" => policy)
      return prompt unless classification_result["requires_sanitization"]

      sanitization_result = sanitization.execute(
        "raw_payload" => raw, "policy" => policy, "classification" => classification_result
      )
      JSON.parse(sanitization_result["sanitized_payload"]).dig("metadata", "prompt_text")
    end

    it "does not redact an unlabeled 40-char AWS secret with / and + chars (no reliable anchor)" do
      secret = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
      result = sanitize_prompt("Secret: #{secret}")
      expect(result).to include(secret)
    end

    include_examples "redacted end-to-end",
      "redacts the AKIA access key ID when co-located with an unlabeled secret",
      "Access key: AKIAIOSFODNN7EXAMPLE Secret: wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      ->(text) {
        expect(text).not_to include("AKIAIOSFODNN7EXAMPLE")
        expect(text).to include("[REDACTED]")
      }
  end

  describe "JWT / Bearer token redaction (AC 6)" do
    # Fake JWT: header.payload.signature (all base64url-encoded JSON-ish strings)
    let(:fake_jwt) { "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c" }

    include_examples "redacted end-to-end",
      "redacts a full 3-segment JWT",
      "Token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
      ->(text) {
        expect(text).not_to include("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9")
        expect(text).to include("[REDACTED]")
      }

    include_examples "redacted end-to-end",
      "redacts a Bearer authorization header value",
      "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
      ->(text) {
        expect(text).not_to include("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9")
        expect(text).to include("[REDACTED]")
      }
  end

  # ──────────────────────────────────────────────────────────────────────────────
  # Regression: existing redactions must still work (AC 7)
  # ──────────────────────────────────────────────────────────────────────────────

  describe "Regression — existing redactions still work (AC 7)" do
    include_examples "redacted end-to-end",
      "still redacts AKIA access key ID",
      "AWS access key: AKIAIOSFODNN7EXAMPLE",
      ->(text) {
        expect(text).not_to include("AKIAIOSFODNN7EXAMPLE")
        expect(text).to include("[REDACTED]")
      }

    include_examples "redacted end-to-end",
      "still redacts email address",
      "Contact me at alice@example.com please",
      ->(text) {
        expect(text).not_to include("alice@example.com")
        expect(text).to include("[REDACTED]")
      }

    include_examples "redacted end-to-end",
      "still redacts SSN",
      "My SSN is 123-45-6789",
      ->(text) {
        expect(text).not_to include("123-45-6789")
        expect(text).to include("[REDACTED]")
      }

    # The generic api_key net (\b[A-Za-z0-9_-]{32,}\b) that used to catch any long
    # alphanumeric run was retired (AIX-579) in favor of the anchored provider
    # patterns above — an unprefixed opaque string no longer triggers redaction.
    it "does not redact a long generic alphanumeric string with no provider prefix" do
      long_key = "a" * 32
      raw = claude_payload(prompt_text: "Here is key=#{long_key} use it")

      classification_result = classification.execute("raw_payload" => raw, "policy" => policy)
      expect(classification_result["requires_sanitization"]).to be false
    end
  end

  # ──────────────────────────────────────────────────────────────────────────────
  # No over-redaction of ordinary prose (AC 8)
  # ──────────────────────────────────────────────────────────────────────────────

  # AC 8 — document deliberate false-positive tradeoffs in this corpus.
  # Security-over-precision is acceptable for prompt/assistant text; what matters is that
  # every tradeoff is recorded here, not that it is eliminated.
  describe "Over-redaction tradeoffs documented (AC 8)" do
    def sanitize_prompt(prompt)
      raw = claude_payload(prompt_text: prompt)
      classification_result = classification.execute("raw_payload" => raw, "policy" => policy)
      return prompt unless classification_result["requires_sanitization"]

      sanitization_result = sanitization.execute(
        "raw_payload" => raw, "policy" => policy, "classification" => classification_result
      )
      JSON.parse(sanitization_result["sanitized_payload"]).dig("metadata", "prompt_text")
    end

    # The generic api_key net that used to redact git SHAs as an accepted false-positive
    # tradeoff was retired (AIX-579) — a bare hex/alphanumeric run with no provider
    # prefix is no longer flagged as a secret.
    it "does not redact a git SHA (40 hex chars, no provider prefix)" do
      sha = "a3f5b2c1d4e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0"
      result = sanitize_prompt("Last commit: #{sha}")
      expect(result).to include(sha)
    end

    # Same retirement (AIX-579) applies to UUIDs, previously caught by the same net.
    it "does not redact a UUID (no provider prefix)" do
      uuid = "550e8400-e29b-41d4-a716-446655440000"
      result = sanitize_prompt("Session ID: #{uuid}")
      expect(result).to include(uuid)
    end

    it "does not redact a short word (<32 chars)" do
      result = sanitize_prompt("Use the token endpoint at /auth/token")
      expect(result).to include("/auth/token")
    end

    # The aws_secret heuristic that used to redact an isolated 40-char base64 string
    # was retired alongside the generic net (AIX-579) — see the "AWS secret key
    # redaction" describe block above. A substring embedded in a longer blob was never
    # redacted either way (lookahead guard when the pattern existed).
    it "does not redact a 40-char base64 substring embedded in a longer base64 blob" do
      long_base64 = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEYextra=="
      result = sanitize_prompt("Data: #{long_base64}")
      expect(result).to include(long_base64)
    end
  end

  # ──────────────────────────────────────────────────────────────────────────────
  # Version bump verification (AC 10)
  # ──────────────────────────────────────────────────────────────────────────────

  describe "Sanitizer version (AC 10)" do
    it "DEFAULT_POLICY version is 2" do
      expect(Activities::GetPolicyActivity::DEFAULT_POLICY["version"]).to eq(2)
    end
  end

  # ──────────────────────────────────────────────────────────────────────────────
  # GetPolicyActivity falls back to DEFAULT_POLICY when INTERNAL_API_KEY is unset (AC 2)
  # ──────────────────────────────────────────────────────────────────────────────

  describe "Authoritative policy (AC 2)" do
    it "returns DEFAULT_POLICY when INTERNAL_API_KEY is not set" do
      activity = Activities::GetPolicyActivity.new
      allow(Temporalio::Activity::Context).to receive(:current).and_return(activity_context)
      allow(ENV).to receive(:fetch).with("INTERNAL_API_KEY", nil).and_return(nil)
      allow(ENV).to receive(:fetch).with("RAILS_API_URL", "http://localhost:3000").and_call_original

      policy_result = activity.execute("organization_id" => "test-org")

      expect(policy_result["id"]).to eq("default")
      expect(policy_result["version"]).to eq(2)
    end
  end
end

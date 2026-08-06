# frozen_string_literal: true

require "rails_helper"

RSpec.describe EventTexts::Persist, type: :unit do
  let(:tool_event_id) { SecureRandom.uuid }
  let(:occurred_at)   { Time.current }
  let(:user_text)     { "What is a Fibonacci sequence?" }
  let(:assistant_text) { "A Fibonacci sequence is..." }

  def call(**overrides)
    described_class.call(
      tool_event_id: tool_event_id,
      occurred_at: occurred_at,
      user_text: user_text,
      assistant_text: assistant_text,
      **overrides
    )
  end

  context "when kill switch is OFF (default)" do
    before  { ENV.delete("AIXLE_INSIGHTS_PROMPT_CAPTURE") }
    after   { ENV.delete("AIXLE_INSIGHTS_PROMPT_CAPTURE") }

    it "returns captured: false and creates no row" do
      result = call
      expect(result[:captured]).to be false
      expect(result[:event_text]).to be_nil
      expect(EventText.count).to eq(0)
    end

    it "also skips when AIXLE_INSIGHTS_PROMPT_CAPTURE=false" do
      ENV["AIXLE_INSIGHTS_PROMPT_CAPTURE"] = "false"
      result = call
      expect(result[:captured]).to be false
      expect(EventText.count).to eq(0)
    end
  end

  context "when kill switch is ON" do
    before { ENV["AIXLE_INSIGHTS_PROMPT_CAPTURE"] = "true" }
    after  { ENV.delete("AIXLE_INSIGHTS_PROMPT_CAPTURE") }

    it "inserts a row and returns captured: true" do
      result = call
      expect(result[:captured]).to be true
      expect(result[:event_text]).to be_a(EventText)
      expect(EventText.count).to eq(1)
    end

    it "truncates user_text to MAX_TEXT_LENGTH" do
      long_text = "x" * 9000
      call(user_text: long_text)

      row = EventText.find_by(tool_event_id: tool_event_id, occurred_at: occurred_at)
      expect(row.user_text.length).to eq(described_class::MAX_TEXT_LENGTH)
    end

    it "truncates assistant_text to MAX_TEXT_LENGTH" do
      long_text = "a" * 9000
      call(assistant_text: long_text)

      row = EventText.find_by(tool_event_id: tool_event_id, occurred_at: occurred_at)
      expect(row.assistant_text.length).to eq(described_class::MAX_TEXT_LENGTH)
    end

    it "stamps sanitized_at and provided sanitizer_version" do
      call(sanitizer_version: "v2")

      row = EventText.find_by(tool_event_id: tool_event_id, occurred_at: occurred_at)
      expect(row.sanitized_at).to be_present
      expect(row.sanitizer_version).to eq("v2")
    end

    it "falls back to SANITIZER_VERSION_DEFAULT when sanitizer_version is nil" do
      call(sanitizer_version: nil)

      row = EventText.find_by(tool_event_id: tool_event_id, occurred_at: occurred_at)
      expect(row.sanitizer_version).to eq(described_class::SANITIZER_VERSION_DEFAULT)
    end

    it "returns captured: false when both texts are blank" do
      result = call(user_text: nil, assistant_text: nil)
      expect(result[:captured]).to be false
      expect(EventText.count).to eq(0)
    end

    it "captures when only user_text is present" do
      result = call(user_text: "Hello", assistant_text: nil)
      expect(result[:captured]).to be true
    end

    it "captures when only assistant_text is present" do
      result = call(user_text: nil, assistant_text: "Response")
      expect(result[:captured]).to be true
    end

    it "is idempotent on replay — does not create duplicate rows" do
      call
      expect { call }.not_to change(EventText, :count)
    end

    it "updates existing row on replay (upsert semantics)" do
      call(user_text: "First text")
      call(user_text: "Updated text")

      rows = EventText.where(tool_event_id: tool_event_id, occurred_at: occurred_at)
      expect(rows.count).to eq(1)
      expect(rows.first.user_text).to eq("Updated text")
    end
  end
end

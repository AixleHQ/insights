# frozen_string_literal: true

require "rails_helper"

RSpec.describe ToolEventDetailSerializer, type: :serializer do
  let(:organization) { create(:organization) }
  let(:user) { create(:user) }
  let(:event) { create(:tool_event, organization: organization, user: user) }

  def seed_event_text(**attrs)
    create(:event_text, tool_event_id: event.id, occurred_at: event.occurred_at, **attrs)
  end

  describe "eventText field gate" do
    it "omits eventText entirely when show_event_text is falsey (member)" do
      seed_event_text
      data = described_class.new(event, params: { show_event_text: false }).serialize

      expect(data).not_to have_key("eventText")
    end

    it "omits eventText when no params are passed at all" do
      seed_event_text
      data = described_class.new(event).serialize

      expect(data).not_to have_key("eventText")
    end

    it "includes eventText when show_event_text is true and a row exists" do
      seed_event_text(user_text: "hello", assistant_text: "hi there")
      data = described_class.new(event, params: { show_event_text: true }).serialize

      expect(data).to have_key("eventText")
      # Nested keys are symbol camelCase (block-returned hash, not deep-transformed).
      expect(data["eventText"]).to include(
        userText: "hello",
        assistantText: "hi there"
      )
    end

    it "iso8601-formats sanitizedAt" do
      timestamp = Time.utc(2026, 6, 10, 14, 30, 0)
      seed_event_text(sanitized_at: timestamp)
      data = described_class.new(event, params: { show_event_text: true }).serialize

      expect(data["eventText"][:sanitizedAt]).to eq(timestamp.iso8601)
    end

    it "returns eventText as null when the flag is true but no row exists" do
      data = described_class.new(event, params: { show_event_text: true }).serialize

      expect(data).to have_key("eventText")
      expect(data["eventText"]).to be_nil
    end
  end
end

# frozen_string_literal: true

require "rails_helper"
require "rake"

RSpec.describe "backfill:event_data" do
  before(:all) do
    Rails.application.load_tasks
  end

  let(:organization) { create(:organization) }
  let(:user)         { create(:user) }

  before do
    Rake::Task["backfill:event_data"].reenable
  end

  def build_event(overrides = {})
    create(:tool_event,
      organization: organization,
      user: user,
      tool_name: "claude_code",
      event_type: "chat",
      occurred_at: Time.current,
      tokens_in: 500,
      tokens_out: 200,
      cost_usd: nil,
      model: nil,
      **overrides
    )
  end

  context "when event has null model column but metadata['model'] is set" do
    it "promotes model from metadata to the model column" do
      event = build_event(metadata: { "model" => "claude-opus-4-5-20251001", "session_id" => SecureRandom.uuid })
      expect(event.model).to be_nil

      Rake::Task["backfill:event_data"].invoke

      expect(event.reload.model).to eq("claude-opus-4-5-20251001")
    end

    it "calculates cost_usd after model promotion" do
      event = build_event(metadata: { "model" => "claude-opus-4-5-20251001", "session_id" => SecureRandom.uuid })

      Rake::Task["backfill:event_data"].invoke

      event.reload
      expect(event.cost_usd.to_f).to be > 0
      expect(event.metadata["cost_source"]).to eq("server_backfill")
    end
  end

  context "when event already has model column set" do
    it "does not overwrite the existing model" do
      event = build_event(
        model: "claude-sonnet-4-6",
        metadata: { "model" => "something-else", "session_id" => SecureRandom.uuid }
      )

      Rake::Task["backfill:event_data"].invoke

      expect(event.reload.model).to eq("claude-sonnet-4-6")
    end
  end

  context "when metadata has no model key" do
    it "does not error and leaves event unchanged" do
      event = build_event(metadata: { "session_id" => SecureRandom.uuid })

      expect { Rake::Task["backfill:event_data"].invoke }.not_to raise_error
      expect(event.reload.model).to be_nil
    end
  end

  context "when event already has cost_usd set" do
    it "does not overwrite existing cost" do
      event = build_event(
        cost_usd: 0.999,
        metadata: { "model" => "claude-opus-4-5-20251001", "session_id" => SecureRandom.uuid }
      )

      Rake::Task["backfill:event_data"].invoke

      expect(event.reload.cost_usd.to_f).to eq(0.999)
    end
  end
end

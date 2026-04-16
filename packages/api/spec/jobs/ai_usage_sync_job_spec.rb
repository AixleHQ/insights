# frozen_string_literal: true

require "rails_helper"

RSpec.describe AiUsageSyncJob, type: :job do
  let(:organization) { create(:organization) }
  let(:connector) do
    create(:organization_connector,
      organization: organization,
      connector_type: "anthropic",
      access_token: "sk-ant-admin-test",
      is_active: true)
  end

  let(:sample_usage) do
    [
      {
        external_id: "anthropic-claude-sonnet-4-6-2026-04-08",
        model: "claude-sonnet-4-6",
        tokens_in: 50_000,
        tokens_out: 15_000,
        occurred_at: Time.parse("2026-04-08T00:00:00Z")
      }
    ]
  end

  before do
    connector # ensure connector exists
    allow(Oauth::AnthropicProvider).to receive(:new).and_call_original
    allow_any_instance_of(Oauth::AnthropicProvider).to receive(:fetch_usage).and_return(sample_usage)
  end

  def find_synced_event(external_id = "anthropic-claude-sonnet-4-6-2026-04-08")
    ToolEvent.find_by("organization_id = ? AND metadata->>'external_id' = ?", organization.id, external_id)
  end

  describe "#perform — Anthropic provider" do
    it "creates a ToolEvent for each usage entry" do
      expect {
        described_class.new.perform(organization.id, "anthropic")
      }.to change(ToolEvent, :count).by(1)
    end

    it "sets tool_name to anthropic_api" do
      described_class.new.perform(organization.id, "anthropic")

      expect(find_synced_event.tool_name).to eq("anthropic_api")
    end

    it "sets the correct model, tokens, and occurred_at" do
      described_class.new.perform(organization.id, "anthropic")

      event = find_synced_event
      expect(event.model).to eq("claude-sonnet-4-6")
      expect(event.tokens_in).to eq(50_000)
      expect(event.tokens_out).to eq(15_000)
      expect(event.occurred_at).to be_within(1.second).of(Time.parse("2026-04-08T00:00:00Z"))
    end

    it "stores external_id and reconciled flag in metadata" do
      described_class.new.perform(organization.id, "anthropic")

      event = find_synced_event
      expect(event.metadata["external_id"]).to eq("anthropic-claude-sonnet-4-6-2026-04-08")
      expect(event.metadata["reconciled"]).to be true
    end

    it "calculates cost_usd via ModelPricingService" do
      described_class.new.perform(organization.id, "anthropic")

      expect(find_synced_event.cost_usd).to be > 0
    end

    it "calls fetch_usage with the last 7 days date range" do
      provider = instance_double(Oauth::AnthropicProvider)
      allow(provider).to receive(:fetch_usage).and_return(sample_usage)
      allow(Oauth::AnthropicProvider).to receive(:new).and_return(provider)

      travel_to Time.zone.now do
        described_class.new.perform(organization.id, "anthropic")

        expect(provider).to have_received(:fetch_usage)
          .with(start_date: 7.days.ago.to_date, end_date: Date.today)
      end
    end

    context "when the same job runs twice" do
      it "does not create a duplicate ToolEvent" do
        described_class.new.perform(organization.id, "anthropic")

        expect {
          described_class.new.perform(organization.id, "anthropic")
        }.not_to change(ToolEvent, :count)
      end
    end

    context "when cost_usd differs on re-sync" do
      it "updates the existing event's cost" do
        described_class.new.perform(organization.id, "anthropic")

        event = find_synced_event
        original_cost = event.cost_usd

        # Return same external_id with 10x tokens — ModelPricingService recalculates a higher cost
        updated_usage = sample_usage.map { |u| u.merge(tokens_in: u[:tokens_in] * 10, tokens_out: u[:tokens_out] * 10) }
        allow_any_instance_of(Oauth::AnthropicProvider).to receive(:fetch_usage).and_return(updated_usage)

        described_class.new.perform(organization.id, "anthropic")

        expect(event.reload.cost_usd).to be > original_cost
      end
    end

    context "when model is unknown" do
      let(:sample_usage) do
        [
          {
            external_id: "anthropic-claude-unknown-model-2026-04-08",
            model: "claude-unknown-model",
            tokens_in: 1_000,
            tokens_out: 500,
            occurred_at: Time.parse("2026-04-08T00:00:00Z")
          }
        ]
      end

      it "falls back to default pricing without raising" do
        expect {
          described_class.new.perform(organization.id, "anthropic")
        }.not_to raise_error

        expect(find_synced_event("anthropic-claude-unknown-model-2026-04-08").cost_usd).to be > 0
      end
    end

    context "when fetch_usage returns nil" do
      before do
        allow_any_instance_of(Oauth::AnthropicProvider).to receive(:fetch_usage).and_return(nil)
      end

      it "does not create any ToolEvents" do
        expect {
          described_class.new.perform(organization.id, "anthropic")
        }.not_to change(ToolEvent, :count)
      end
    end

    context "when no active Anthropic connector exists" do
      before { connector.update!(is_active: false) }

      it "does not create any ToolEvents" do
        expect {
          described_class.new.perform(organization.id, "anthropic")
        }.not_to change(ToolEvent, :count)
      end
    end
  end
end

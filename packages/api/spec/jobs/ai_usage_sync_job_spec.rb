# frozen_string_literal: true

require "rails_helper"

RSpec.describe AiUsageSyncJob, type: :job do
  subject(:job) { described_class.new }

  let(:organization) { create(:organization) }

  def find_synced_event(external_id)
    ToolEvent.find_by("organization_id = ? AND metadata->>'external_id' = ?", organization.id, external_id)
  end

  describe "#perform — Anthropic provider" do
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
      connector
      allow(Oauth::AnthropicProvider).to receive(:new).and_call_original
      allow_any_instance_of(Oauth::AnthropicProvider).to receive(:fetch_usage).and_return(sample_usage)
    end

    it "creates a ToolEvent for each usage entry" do
      expect {
        job.perform(organization.id, "anthropic")
      }.to change(ToolEvent, :count).by(1)
    end

    it "sets tool_name to anthropic_api" do
      job.perform(organization.id, "anthropic")

      expect(find_synced_event("anthropic-claude-sonnet-4-6-2026-04-08").tool_name).to eq("anthropic_api")
    end

    it "sets the correct model, tokens, and occurred_at" do
      job.perform(organization.id, "anthropic")

      event = find_synced_event("anthropic-claude-sonnet-4-6-2026-04-08")
      expect(event.model).to eq("claude-sonnet-4-6")
      expect(event.tokens_in).to eq(50_000)
      expect(event.tokens_out).to eq(15_000)
      expect(event.occurred_at).to be_within(1.second).of(Time.parse("2026-04-08T00:00:00Z"))
    end

    it "stores external_id and reconciled flag in metadata" do
      job.perform(organization.id, "anthropic")

      event = find_synced_event("anthropic-claude-sonnet-4-6-2026-04-08")
      expect(event.metadata["external_id"]).to eq("anthropic-claude-sonnet-4-6-2026-04-08")
      expect(event.metadata["reconciled"]).to be true
    end

    it "calculates cost_usd via ModelPricingService" do
      job.perform(organization.id, "anthropic")

      expect(find_synced_event("anthropic-claude-sonnet-4-6-2026-04-08").cost_usd).to be > 0
    end

    it "uses 90-day window on initial sync (no last_sync_at)" do
      connector.update!(last_sync_at: nil)
      provider = instance_double(Oauth::AnthropicProvider)
      allow(provider).to receive(:fetch_usage).and_return(sample_usage)
      allow(Oauth::AnthropicProvider).to receive(:new).and_return(provider)

      travel_to Time.zone.now do
        job.perform(organization.id, "anthropic")

        expect(provider).to have_received(:fetch_usage)
          .with(start_date: 90.days.ago.to_date, end_date: Date.today)
      end
    end

    it "uses 7-day window on recurring sync (has last_sync_at)" do
      connector.update!(last_sync_at: 1.hour.ago)
      provider = instance_double(Oauth::AnthropicProvider)
      allow(provider).to receive(:fetch_usage).and_return(sample_usage)
      allow(Oauth::AnthropicProvider).to receive(:new).and_return(provider)

      travel_to Time.zone.now do
        job.perform(organization.id, "anthropic")

        expect(provider).to have_received(:fetch_usage)
          .with(start_date: 7.days.ago.to_date, end_date: Date.today)
      end
    end

    it "does not create a duplicate ToolEvent when the same job runs twice" do
      job.perform(organization.id, "anthropic")

      expect {
        job.perform(organization.id, "anthropic")
      }.not_to change(ToolEvent, :count)
    end

    it "updates the existing event's sync fields on re-sync" do
      job.perform(organization.id, "anthropic")

      event = find_synced_event("anthropic-claude-sonnet-4-6-2026-04-08")
      updated_usage = sample_usage.map do |usage|
        usage.merge(tokens_in: usage[:tokens_in] * 10, tokens_out: usage[:tokens_out] * 10)
      end
      allow_any_instance_of(Oauth::AnthropicProvider).to receive(:fetch_usage).and_return(updated_usage)

      job.perform(organization.id, "anthropic")

      event.reload
      expect(event.tokens_in).to eq(500_000)
      expect(event.tokens_out).to eq(150_000)
      expect(event.tokens_total).to eq(650_000)
      expect(event.cost_usd).to be > 0
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
          job.perform(organization.id, "anthropic")
        }.not_to raise_error

        expect(find_synced_event("anthropic-claude-unknown-model-2026-04-08").cost_usd).to be > 0
      end
    end

    it "does not create any ToolEvents when fetch_usage returns nil" do
      allow_any_instance_of(Oauth::AnthropicProvider).to receive(:fetch_usage).and_return(nil)

      expect {
        job.perform(organization.id, "anthropic")
      }.not_to change(ToolEvent, :count)
    end

    it "does not create any ToolEvents when no active Anthropic connector exists" do
      connector.update!(is_active: false)

      expect {
        job.perform(organization.id, "anthropic")
      }.not_to change(ToolEvent, :count)
    end
  end

  describe "#perform — OpenRouter provider" do
    let(:connector) do
      create(:organization_connector,
        organization: organization,
        connector_type: "openrouter",
        access_token: "or-test",
        is_active: true,
        last_sync_at: last_sync_at)
    end
    let(:last_sync_at) { nil }
    let(:activity_response) do
      {
        "data" => [
          {
            "date" => "2026-04-29",
            "model" => "openai/gpt-4.1",
            "model_permaslug" => "openai/gpt-4.1-2025-04-14",
            "endpoint_id" => "endpoint-123",
            "provider_name" => "OpenAI",
            "usage" => 0.015,
            "byok_usage_inference" => 0.012,
            "requests" => 5,
            "prompt_tokens" => 50,
            "completion_tokens" => 125,
            "reasoning_tokens" => 25
          }
        ]
      }
    end
    let(:external_id) { "openrouter:2026-04-29:endpoint-123:openai/gpt-4.1" }

    before do
      connector
      allow(job).to receive(:perform_json_get) do |uri, _access_token|
        if uri.query == "date=2026-04-29"
          activity_response
        else
          { "data" => [] }
        end
      end
    end

    it "creates a ToolEvent for each OpenRouter activity row" do
      travel_to Time.zone.parse("2026-04-30 12:00:00 UTC") do
        expect {
          job.perform(organization.id, "openrouter")
        }.to change(ToolEvent, :count).by(1)
      end
    end

    it "maps provider, model, token counts, and API-provided cost onto the event" do
      travel_to Time.zone.parse("2026-04-30 12:00:00 UTC") do
        job.perform(organization.id, "openrouter")
      end

      event = find_synced_event(external_id)
      expect(event.tool_name).to eq("openrouter_api")
      expect(event.model).to eq("openai/gpt-4.1")
      expect(event.tokens_in).to eq(50)
      expect(event.tokens_out).to eq(125)
      expect(event.cost_usd).to eq(0.015)
      expect(event.metadata).to include(
        "provider" => "openai",
        "routed_model" => "openai/gpt-4.1",
        "provider_name" => "OpenAI",
        "endpoint_id" => "endpoint-123",
        "aggregation_level" => "daily_endpoint_model",
        "synced_from" => "activity_api"
      )
    end

    it "uses a 90-day window on initial sync" do
      connector.update!(last_sync_at: nil)

      travel_to Time.zone.parse("2026-04-30 12:00:00 UTC") do
        job.perform(organization.id, "openrouter")
      end

      expect(job).to have_received(:perform_json_get).exactly(90).times
    end

    it "uses last_sync_at with a 1-day overlap on recurring sync" do
      connector.update!(last_sync_at: Time.zone.parse("2026-04-01 08:30:00 UTC"))

      travel_to Time.zone.parse("2026-04-30 12:00:00 UTC") do
        job.perform(organization.id, "openrouter")
      end

      # 2026-03-31 through 2026-04-29 inclusive
      expect(job).to have_received(:perform_json_get).exactly(30).times
    end

    it "does not create a duplicate ToolEvent when the same job runs twice" do
      travel_to Time.zone.parse("2026-04-30 12:00:00 UTC") do
        job.perform(organization.id, "openrouter")
      end

      expect {
        travel_to Time.zone.parse("2026-04-30 12:00:00 UTC") do
          job.perform(organization.id, "openrouter")
        end
      }.not_to change(ToolEvent, :count)
    end

    it "updates the existing event when the synced usage changes" do
      travel_to Time.zone.parse("2026-04-30 12:00:00 UTC") do
        job.perform(organization.id, "openrouter")
      end

      allow(job).to receive(:perform_json_get) do |uri, _access_token|
        if uri.query == "date=2026-04-29"
          {
            "data" => [
              activity_response["data"].first.merge(
                "usage" => 0.025,
                "prompt_tokens" => 75,
                "completion_tokens" => 150
              )
            ]
          }
        else
          { "data" => [] }
        end
      end

      travel_to Time.zone.parse("2026-04-30 12:00:00 UTC") do
        job.perform(organization.id, "openrouter")
      end

      event = find_synced_event(external_id).reload
      expect(event.tokens_in).to eq(75)
      expect(event.tokens_out).to eq(150)
      expect(event.tokens_total).to eq(225)
      expect(event.cost_usd).to eq(0.025)
    end

    it "marks the connector synced after a successful run" do
      travel_to Time.zone.parse("2026-04-30 12:00:00 UTC") do
        job.perform(organization.id, "openrouter")
      end

      expect(connector.reload.status).to eq("connected")
      expect(connector.last_sync_at).to be_present
    end

    it "stores a friendly management-key error when OpenRouter activity sync is forbidden" do
      allow(job).to receive(:perform_json_get)
        .and_raise(StandardError, 'HTTP 403: {"error":{"message":"Only management keys can fetch activity for an account","code":403}}')

      travel_to Time.zone.parse("2026-04-30 12:00:00 UTC") do
        job.perform(organization.id, "openrouter")
      end

      expect(connector.reload.status).to eq("error")
      expect(connector.last_error).to eq(
        "OpenRouter usage sync requires a management key. Reconnect this integration with a management key to fetch activity data."
      )
    end
  end
end

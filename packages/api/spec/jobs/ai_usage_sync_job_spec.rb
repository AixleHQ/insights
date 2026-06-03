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

  describe "#perform — OpenAI provider" do
    let(:connector) do
      create(:organization_connector,
        organization: organization,
        connector_type: "openai",
        access_token: "sk-admin-test",
        is_active: true)
    end

    let(:sample_usage) do
      [
        {
          external_id: "openai-gpt-4o-2026-04-08",
          model: "gpt-4o",
          tokens_in: 50_000,
          tokens_out: 15_000,
          occurred_at: Time.utc(2026, 4, 8)
        }
      ]
    end

    before do
      connector
      allow_any_instance_of(Oauth::OpenaiProvider).to receive(:fetch_usage).and_return(sample_usage)
    end

    it "creates a ToolEvent for each usage entry" do
      expect {
        job.perform(organization.id, "openai")
      }.to change(ToolEvent, :count).by(1)
    end

    it "sets tool_name to openai_api" do
      job.perform(organization.id, "openai")

      expect(find_synced_event("openai-gpt-4o-2026-04-08").tool_name).to eq("openai_api")
    end

    it "sets the correct model, tokens, and occurred_at" do
      job.perform(organization.id, "openai")

      event = find_synced_event("openai-gpt-4o-2026-04-08")
      expect(event.model).to eq("gpt-4o")
      expect(event.tokens_in).to eq(50_000)
      expect(event.tokens_out).to eq(15_000)
      expect(event.occurred_at).to be_within(1.second).of(Time.utc(2026, 4, 8))
    end

    it "stores external_id and reconciled flag in metadata" do
      job.perform(organization.id, "openai")

      event = find_synced_event("openai-gpt-4o-2026-04-08")
      expect(event.metadata["external_id"]).to eq("openai-gpt-4o-2026-04-08")
      expect(event.metadata["reconciled"]).to be true
    end

    it "calculates cost_usd via ModelPricingService" do
      job.perform(organization.id, "openai")

      expect(find_synced_event("openai-gpt-4o-2026-04-08").cost_usd).to be > 0
    end

    it "uses 90-day window on initial sync (no last_sync_at)" do
      connector.update!(last_sync_at: nil)
      provider = instance_double(Oauth::OpenaiProvider)
      allow(provider).to receive(:fetch_usage).and_return(sample_usage)
      allow(Oauth::OpenaiProvider).to receive(:new).and_return(provider)

      travel_to Time.zone.now do
        job.perform(organization.id, "openai")

        expect(provider).to have_received(:fetch_usage)
          .with(start_date: 90.days.ago.to_date, end_date: Date.today)
      end
    end

    it "uses 7-day window on recurring sync (has last_sync_at)" do
      connector.update!(last_sync_at: 1.hour.ago)
      provider = instance_double(Oauth::OpenaiProvider)
      allow(provider).to receive(:fetch_usage).and_return(sample_usage)
      allow(Oauth::OpenaiProvider).to receive(:new).and_return(provider)

      travel_to Time.zone.now do
        job.perform(organization.id, "openai")

        expect(provider).to have_received(:fetch_usage)
          .with(start_date: 7.days.ago.to_date, end_date: Date.today)
      end
    end

    it "does not create a duplicate ToolEvent when the same job runs twice" do
      job.perform(organization.id, "openai")

      expect {
        job.perform(organization.id, "openai")
      }.not_to change(ToolEvent, :count)
    end

    it "updates the existing event's sync fields on re-sync" do
      job.perform(organization.id, "openai")

      event = find_synced_event("openai-gpt-4o-2026-04-08")
      updated_usage = sample_usage.map do |usage|
        usage.merge(tokens_in: usage[:tokens_in] * 10, tokens_out: usage[:tokens_out] * 10)
      end
      allow_any_instance_of(Oauth::OpenaiProvider).to receive(:fetch_usage).and_return(updated_usage)

      job.perform(organization.id, "openai")

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
            external_id: "openai-gpt-unknown-model-2026-04-08",
            model: "gpt-unknown-model",
            tokens_in: 1_000,
            tokens_out: 500,
            occurred_at: Time.utc(2026, 4, 8)
          }
        ]
      end

      it "falls back to default pricing without raising" do
        expect {
          job.perform(organization.id, "openai")
        }.not_to raise_error

        expect(find_synced_event("openai-gpt-unknown-model-2026-04-08").cost_usd).to be > 0
      end
    end

    it "does not create any ToolEvents when fetch_usage returns nil" do
      allow_any_instance_of(Oauth::OpenaiProvider).to receive(:fetch_usage).and_return(nil)

      expect {
        job.perform(organization.id, "openai")
      }.not_to change(ToolEvent, :count)
    end

    it "does not update connector status when fetch_usage returns nil" do
      allow_any_instance_of(Oauth::OpenaiProvider).to receive(:fetch_usage).and_return(nil)
      previous_status = connector.status
      previous_sync_at = connector.last_sync_at

      job.perform(organization.id, "openai")

      connector.reload
      expect(connector.status).to eq(previous_status)
      expect(connector.last_sync_at).to eq(previous_sync_at)
    end

    it "marks the connector synced after a successful run" do
      job.perform(organization.id, "openai")

      expect(connector.reload.status).to eq("connected")
      expect(connector.last_sync_at).to be_present
    end

    it "marks the connector synced when fetch_usage returns empty (no usage in period)" do
      allow_any_instance_of(Oauth::OpenaiProvider).to receive(:fetch_usage).and_return([])

      expect {
        job.perform(organization.id, "openai")
      }.not_to change(ToolEvent, :count)

      expect(connector.reload.status).to eq("connected")
    end

    it "does not create any ToolEvents when no active OpenAI connector exists" do
      connector.update!(is_active: false)

      expect {
        job.perform(organization.id, "openai")
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
    let(:sample_activity) do
      [
        {
          external_id: "openrouter:2026-04-29:endpoint-123:openai/gpt-4.1",
          model: "openai/gpt-4.1",
          tokens_in: 50,
          tokens_out: 125,
          cost_usd: 0.015,
          occurred_at: Time.zone.parse("2026-04-29 23:59:59 UTC"),
          metadata: {
            provider: "openai",
            routed_model: "openai/gpt-4.1",
            model_permaslug: "openai/gpt-4.1-2025-04-14",
            provider_name: "OpenAI",
            endpoint_id: "endpoint-123",
            requests: 5,
            reasoning_tokens: 25,
            byok_usage_inference: 0.012,
            aggregation_level: "daily_endpoint_model",
            synced_from: "activity_api",
            usage_date: "2026-04-29"
          }
        }
      ]
    end
    let(:external_id) { "openrouter:2026-04-29:endpoint-123:openai/gpt-4.1" }
    let(:provider_double) { instance_double(Oauth::OpenrouterProvider) }

    before do
      connector
      allow(Oauth::OpenrouterProvider).to receive(:new).and_return(provider_double)
      allow(provider_double).to receive(:fetch_activity).and_return(sample_activity)
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

    it "uses a 29-day window on initial sync (no last_sync_at)" do
      connector.update!(last_sync_at: nil)

      travel_to Time.zone.parse("2026-04-30 12:00:00 UTC") do
        job.perform(organization.id, "openrouter")

        expect(provider_double).to have_received(:fetch_activity)
          .with(start_date: 29.days.ago.to_date, end_date: Date.yesterday)
      end
    end

    it "uses a 7-day window on recurring sync (has last_sync_at)" do
      connector.update!(last_sync_at: 1.hour.ago)

      travel_to Time.zone.parse("2026-04-30 12:00:00 UTC") do
        job.perform(organization.id, "openrouter")

        expect(provider_double).to have_received(:fetch_activity)
          .with(start_date: 7.days.ago.to_date, end_date: Date.yesterday)
      end
    end

    it "returns all results when provider spans multiple dates (multi-date)" do
      multi_day_activity = [
        sample_activity.first,
        sample_activity.first.merge(
          external_id: "openrouter:2026-04-28:endpoint-123:openai/gpt-4.1",
          occurred_at: Time.zone.parse("2026-04-28 23:59:59 UTC"),
          metadata: sample_activity.first[:metadata].merge(usage_date: "2026-04-28")
        )
      ]
      allow(provider_double).to receive(:fetch_activity).and_return(multi_day_activity)

      travel_to Time.zone.parse("2026-04-30 12:00:00 UTC") do
        expect {
          job.perform(organization.id, "openrouter")
        }.to change(ToolEvent, :count).by(2)
      end
    end

    it "does not create any ToolEvents when provider returns an empty array" do
      allow(provider_double).to receive(:fetch_activity).and_return([])

      travel_to Time.zone.parse("2026-04-30 12:00:00 UTC") do
        expect {
          job.perform(organization.id, "openrouter")
        }.not_to change(ToolEvent, :count)
      end
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

      updated_activity = [
        sample_activity.first.merge(tokens_in: 75, tokens_out: 150, cost_usd: 0.025)
      ]
      allow(provider_double).to receive(:fetch_activity).and_return(updated_activity)

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

    it "skips polling and does not create ToolEvents when webhook is active" do
      connector.update!(webhook_active: true)

      travel_to Time.zone.parse("2026-04-30 12:00:00 UTC") do
        expect {
          job.perform(organization.id, "openrouter")
        }.not_to change(ToolEvent, :count)
      end

      expect(provider_double).not_to have_received(:fetch_activity)
    end

    it "does not duplicate events that were created before BatchConnectorUpsert (lazy backfill)" do
      pre_existing = ToolEvent.create!(
        organization_id: organization.id,
        tool_name:       "openrouter_api",
        event_type:      "completion",
        model:           "openai/gpt-4.1",
        tokens_in:       50,
        tokens_out:      125,
        cost_usd:        0.015,
        occurred_at:     Time.zone.parse("2026-04-29 23:59:59 UTC"),
        metadata:        { "external_id" => external_id, "reconciled" => true }
      )

      expect {
        travel_to Time.zone.parse("2026-04-30 12:00:00 UTC") do
          job.perform(organization.id, "openrouter")
        end
      }.not_to change(ToolEvent, :count)

      dedup = ConnectorEventDedup.find_by(
        organization_id: organization.id,
        tool_name:       "openrouter_api",
        unique_key:      "external_id",
        unique_value:    external_id
      )
      expect(dedup).to be_present
      expect(dedup.tool_event_id).to eq(pre_existing.id)
    end

    it "stores a friendly management-key error when OpenRouter activity sync is forbidden" do
      allow(provider_double).to receive(:fetch_activity)
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

  describe "Oauth::OpenrouterProvider#fetch_activity — rate limit retry" do
    let(:connector) do
      create(:organization_connector,
        organization: organization,
        connector_type: "openrouter",
        access_token: "or-test",
        is_active: true,
        last_sync_at: nil)
    end
    let(:provider) { Oauth::OpenrouterProvider.new(connector) }
    let(:faraday_conn) { instance_double(Faraday::Connection) }

    before do
      stub_const("Oauth::OpenrouterProvider::BASE_RETRY_DELAY", 0)
      allow(provider).to receive(:http_client).and_return(faraday_conn)
    end

    it "retries on 429 and succeeds on the second attempt" do
      success_body = JSON.generate(
        "data" => [
          {
            "model" => "openai/gpt-4.1",
            "model_permaslug" => "openai/gpt-4.1-2025-04-14",
            "endpoint_id" => "ep-1",
            "provider_name" => "OpenAI",
            "usage" => 0.01,
            "byok_usage_inference" => 0.0,
            "requests" => 1,
            "prompt_tokens" => 10,
            "completion_tokens" => 20,
            "reasoning_tokens" => 0
          }
        ]
      )
      fake_429 = instance_double(Faraday::Response, status: 429, success?: false, body: "rate limited")
      fake_200 = instance_double(Faraday::Response, status: 200, success?: true, body: success_body)

      call_count = 0
      allow(faraday_conn).to receive(:get) do
        call_count += 1
        call_count == 1 ? fake_429 : fake_200
      end

      results = provider.fetch_activity(start_date: Date.parse("2026-04-29"), end_date: Date.parse("2026-04-29"))

      expect(results.size).to eq(1)
      expect(results.first[:model]).to eq("openai/gpt-4.1")
      expect(call_count).to eq(2)
    end

    it "raises after exhausting MAX_RETRIES on persistent 429" do
      fake_429 = instance_double(Faraday::Response, status: 429, success?: false, body: "rate limited")
      allow(faraday_conn).to receive(:get).and_return(fake_429)

      expect {
        provider.fetch_activity(start_date: Date.parse("2026-04-29"), end_date: Date.parse("2026-04-29"))
      }.to raise_error(RuntimeError, /HTTP 429/)
    end
  end
end

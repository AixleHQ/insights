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
      allow_any_instance_of(Oauth::OpenaiProvider).to receive(:fetch_costs).and_return({})
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
      allow(provider).to receive(:fetch_costs).and_return({})
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
      allow(provider).to receive(:fetch_costs).and_return({})
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

    it "does not call fetch_costs when fetch_usage returns empty" do
      provider_double = instance_double(Oauth::OpenaiProvider)
      allow(Oauth::OpenaiProvider).to receive(:new).and_return(provider_double)
      allow(provider_double).to receive(:fetch_usage).and_return([])
      expect(provider_double).not_to receive(:fetch_costs)

      job.perform(organization.id, "openai")
    end

    it "does not create any ToolEvents when no active OpenAI connector exists" do
      connector.update!(is_active: false)

      expect {
        job.perform(organization.id, "openai")
      }.not_to change(ToolEvent, :count)
    end

    context "cost source — API vs ModelPricingService" do
      let(:usage_date) { Date.new(2026, 4, 8) }
      let(:provider_double) { instance_double(Oauth::OpenaiProvider) }

      before do
        connector
        allow(Oauth::OpenaiProvider).to receive(:new).and_return(provider_double)
        allow(provider_double).to receive(:fetch_usage).and_return([
          {
            external_id: "openai-gpt-4o-2026-04-08",
            model: "gpt-4o",
            tokens_in: 50_000,
            tokens_out: 15_000,
            occurred_at: Time.utc(2026, 4, 8)
          }
        ])
      end

      context "when the costs endpoint returns a matching cost" do
        before do
          allow(provider_double).to receive(:fetch_costs)
            .and_return({ [ "gpt-4o", usage_date ] => 0.05 })
        end

        it "uses the API cost directly" do
          expect(ModelPricingService).not_to receive(:calculate_cost)

          job.perform(organization.id, "openai")

          expect(find_synced_event("openai-gpt-4o-2026-04-08").cost_usd).to eq(0.05)
        end
      end

      context "when the API cost is 0.0 (zero is a valid authoritative value)" do
        before do
          allow(provider_double).to receive(:fetch_costs)
            .and_return({ [ "gpt-4o", usage_date ] => 0.0 })
        end

        it "stores 0.0 and does not fall back to ModelPricingService" do
          expect(ModelPricingService).not_to receive(:calculate_cost)

          job.perform(organization.id, "openai")

          expect(find_synced_event("openai-gpt-4o-2026-04-08").cost_usd).to eq(0.0)
        end
      end

      context "when the costs hash has no matching entry" do
        before do
          allow(provider_double).to receive(:fetch_costs).and_return({})
        end

        it "falls back to ModelPricingService" do
          job.perform(organization.id, "openai")

          expect(find_synced_event("openai-gpt-4o-2026-04-08").cost_usd).to be > 0
        end
      end

      context "when some entries have API cost and some do not" do
        before do
          allow(provider_double).to receive(:fetch_usage).and_return([
            {
              external_id: "openai-gpt-4o-2026-04-08",
              model: "gpt-4o",
              tokens_in: 50_000,
              tokens_out: 15_000,
              occurred_at: Time.utc(2026, 4, 8)
            },
            {
              external_id: "openai-gpt-4o-mini-2026-04-08",
              model: "gpt-4o-mini",
              tokens_in: 10_000,
              tokens_out: 3_000,
              occurred_at: Time.utc(2026, 4, 8)
            }
          ])
          allow(provider_double).to receive(:fetch_costs)
            .and_return({ [ "gpt-4o", usage_date ] => 0.07 })
        end

        it "uses API cost for the matched entry and ModelPricingService for the other" do
          job.perform(organization.id, "openai")

          gpt4o_event = find_synced_event("openai-gpt-4o-2026-04-08")
          mini_event  = find_synced_event("openai-gpt-4o-mini-2026-04-08")

          expect(gpt4o_event.cost_usd).to eq(0.07)
          expect(mini_event.cost_usd).to be > 0
        end
      end
    end

    context "when fetch_usage raises PermissionDeniedError (403 on usage endpoint)" do
      let(:provider_double) { instance_double(Oauth::OpenaiProvider) }

      before do
        connector
        allow(Oauth::OpenaiProvider).to receive(:new).and_return(provider_double)
        allow(provider_double).to receive(:fetch_usage)
          .and_raise(Oauth::PermissionDeniedError, "OpenAI admin key lacks permissions (403).")
      end

      it "does not create any ToolEvents" do
        expect { job.perform(organization.id, "openai") }.not_to change(ToolEvent, :count)
      end

      it "does not update connector status or last_sync_at" do
        previous_status  = connector.status
        previous_sync_at = connector.last_sync_at

        job.perform(organization.id, "openai")

        connector.reload
        expect(connector.status).to eq(previous_status)
        expect(connector.last_sync_at).to eq(previous_sync_at)
      end

      it "does not call mark_error! on the connector" do
        expect(connector).not_to receive(:mark_error!)

        job.perform(organization.id, "openai")
      end

      it "logs a warning mentioning permission denied" do
        expect(Rails.logger).to receive(:warn).with(/permission denied/i).at_least(:once)

        job.perform(organization.id, "openai")
      end
    end

    context "when fetch_costs raises PermissionDeniedError (403 on costs endpoint)" do
      let(:provider_double) { instance_double(Oauth::OpenaiProvider) }

      before do
        connector
        allow(Oauth::OpenaiProvider).to receive(:new).and_return(provider_double)
        allow(provider_double).to receive(:fetch_usage).and_return([
          {
            external_id: "openai-gpt-4o-2026-04-08",
            model: "gpt-4o",
            tokens_in: 50_000,
            tokens_out: 15_000,
            occurred_at: Time.utc(2026, 4, 8)
          }
        ])
        allow(provider_double).to receive(:fetch_costs)
          .and_raise(Oauth::PermissionDeniedError, "OpenAI admin key lacks permissions (403).")
      end

      it "does not create any ToolEvents" do
        expect { job.perform(organization.id, "openai") }.not_to change(ToolEvent, :count)
      end

      it "does not update connector status or last_sync_at" do
        previous_status  = connector.status
        previous_sync_at = connector.last_sync_at

        job.perform(organization.id, "openai")

        connector.reload
        expect(connector.status).to eq(previous_status)
        expect(connector.last_sync_at).to eq(previous_sync_at)
      end

      it "does not call mark_error! on the connector" do
        expect(connector).not_to receive(:mark_error!)

        job.perform(organization.id, "openai")
      end

      it "logs a warning mentioning permission denied" do
        expect(Rails.logger).to receive(:warn).with(/permission denied/i).at_least(:once)

        job.perform(organization.id, "openai")
      end
    end

    context "integration — WebMock wiring (no doubles)" do
      let(:usage_url) { "https://api.openai.com/v1/organization/usage/completions" }
      let(:costs_url) { "https://api.openai.com/v1/organization/costs" }
      let(:usage_date) { Date.new(2026, 4, 8) }

      before do
        connector
        # Override the outer describe-level allow_any_instance_of stubs so real methods run
        # and WebMock can intercept the HTTP calls.
        allow_any_instance_of(Oauth::OpenaiProvider).to receive(:fetch_usage).and_call_original
        allow_any_instance_of(Oauth::OpenaiProvider).to receive(:fetch_costs).and_call_original

        stub_request(:get, usage_url)
          .with(query: hash_including("bucket_width" => "1d"))
          .to_return(
            status: 200,
            body: {
              "data" => [
                {
                  "start_time" => Time.utc(2026, 4, 8).to_i,
                  "results" => [
                    { "model" => "gpt-4o", "input_tokens" => 1_000, "output_tokens" => 500, "input_cached_tokens" => 0 }
                  ]
                }
              ],
              "has_more" => false,
              "next_page" => nil
            }.to_json,
            headers: { "Content-Type" => "application/json" }
          )

        stub_request(:get, costs_url)
          .with(query: hash_including("bucket_width" => "1d"))
          .to_return(
            status: 200,
            body: {
              "data" => [
                {
                  "start_time" => Time.utc(2026, 4, 8).to_i,
                  "results" => [
                    { "model" => "gpt-4o", "amount" => { "value" => 0.042, "currency" => "usd" } }
                  ]
                }
              ],
              "has_more" => false,
              "next_page" => nil
            }.to_json,
            headers: { "Content-Type" => "application/json" }
          )
      end

      it "calls both completions and costs URLs and stores the API cost" do
        job.perform(organization.id, "openai")

        expect(WebMock).to have_requested(:get, /organization\/usage\/completions/).once
        expect(WebMock).to have_requested(:get, /organization\/costs/).once

        event = find_synced_event("openai-gpt-4o-2026-04-08")
        expect(event).to be_present
        expect(event.cost_usd).to eq(0.042)
        expect(event.tool_name).to eq("openai_api")
      end
    end

    context "re-sync updates cost_usd when API value becomes available" do
      let(:usage_date) { Date.new(2026, 4, 8) }
      let(:provider_double) { instance_double(Oauth::OpenaiProvider) }

      before do
        connector
        allow(Oauth::OpenaiProvider).to receive(:new).and_return(provider_double)
        allow(provider_double).to receive(:fetch_usage).and_return([
          {
            external_id: "openai-gpt-4o-2026-04-08",
            model: "gpt-4o",
            tokens_in: 50_000,
            tokens_out: 15_000,
            occurred_at: Time.utc(2026, 4, 8)
          }
        ])
      end

      it "updates cost_usd on re-sync when API cost differs from initial estimate" do
        # First sync: no API cost, ModelPricingService provides estimate
        allow(provider_double).to receive(:fetch_costs).and_return({})
        job.perform(organization.id, "openai")

        event = find_synced_event("openai-gpt-4o-2026-04-08")
        estimated_cost = event.cost_usd
        expect(estimated_cost).to be > 0

        # Second sync: API now returns authoritative cost
        allow(provider_double).to receive(:fetch_costs)
          .and_return({ [ "gpt-4o", usage_date ] => 0.05 })
        job.perform(organization.id, "openai")

        expect(event.reload.cost_usd).to eq(0.05)
        expect(event.reload.cost_usd).not_to eq(estimated_cost)
      end
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

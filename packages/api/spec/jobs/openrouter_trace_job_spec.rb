# frozen_string_literal: true

require "rails_helper"

RSpec.describe OpenrouterTraceJob, type: :job do
  subject(:job) { described_class.new }

  let(:organization) { create(:organization) }
  let(:connector) do
    create(:organization_connector,
      organization: organization,
      connector_type: "openrouter",
      access_token: "or-test-key",
      is_active: true,
      webhook_active: true)
  end

  # OTLP nanosecond timestamp for 2026-05-04 12:00:00 UTC
  let(:start_nano) { "1746352800000000000" }
  let(:end_nano)   { "1746352802500000000" }

  let(:otlp_payload) do
    {
      "resourceSpans" => [
        {
          "scopeSpans" => [
            {
              "spans" => [
                {
                  "traceId" => "abc123tracedefabc1",
                  "spanId" => "span001",
                  "name" => "chat",
                  "startTimeUnixNano" => start_nano,
                  "endTimeUnixNano" => end_nano,
                  "attributes" => [
                    { "key" => "gen_ai.request.model",            "value" => { "stringValue" => "openai/gpt-4o" } },
                    { "key" => "gen_ai.usage.prompt_tokens",      "value" => { "intValue" => 120 } },
                    { "key" => "gen_ai.usage.completion_tokens",  "value" => { "intValue" => 60 } },
                    { "key" => "openrouter.generation.cost",      "value" => { "doubleValue" => 0.00180 } },
                    { "key" => "gen_ai.openrouter.provider_name", "value" => { "stringValue" => "OpenAI" } },
                    { "key" => "gen_ai.finish_reason",            "value" => { "stringValue" => "stop" } }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  end

  let(:payload_json) { otlp_payload.to_json }

  def perform
    job.perform(connector.id, payload_json)
  end

  describe "#perform" do
    it "creates a ToolEvent for the span" do
      expect {
        perform
      }.to change(ToolEvent, :count).by(1)
    end

    it "maps model, tokens, cost, and occurred_at correctly" do
      perform

      event = ToolEvent.last
      expect(event.tool_name).to eq("openrouter_api")
      expect(event.event_type).to eq("completion")
      expect(event.model).to eq("openai/gpt-4o")
      expect(event.tokens_in).to eq(120)
      expect(event.tokens_out).to eq(60)
      expect(event.tokens_total).to eq(180)
      expect(event.cost_usd).to be_within(0.000001).of(0.00180)
      expect(event.occurred_at).to be_within(1.second).of(Time.zone.at(start_nano.to_i / 1_000_000_000.0))
    end

    it "stores external_id derived from traceId in metadata" do
      perform

      event = ToolEvent.last
      expect(event.metadata["external_id"]).to eq("openrouter-trace:abc123tracedefabc1")
    end

    it "stores provider, synced_from, and reconciled in metadata" do
      perform

      meta = ToolEvent.last.metadata
      expect(meta["provider"]).to eq("openai")
      expect(meta["provider_name"]).to eq("OpenAI")
      expect(meta["synced_from"]).to eq("otlp_webhook")
      expect(meta["reconciled"]).to be true
    end

    it "computes duration_ms from span timestamps" do
      perform

      expect(ToolEvent.last.duration_ms).to eq(2500)
    end

    context "when the same span arrives twice (idempotency)" do
      it "does not create a duplicate ToolEvent" do
        perform

        expect {
          perform
        }.not_to change(ToolEvent, :count)
      end

      it "updates the existing event with new data" do
        perform

        updated_payload = otlp_payload.deep_dup
        updated_payload["resourceSpans"][0]["scopeSpans"][0]["spans"][0]["attributes"]
          .find { |a| a["key"] == "gen_ai.usage.prompt_tokens" }["value"]["intValue"] = 200

        job.perform(connector.id, updated_payload.to_json)

        expect(ToolEvent.count).to eq(1)
        expect(ToolEvent.last.tokens_in).to eq(200)
      end
    end

    context "when the connector does not exist" do
      it "logs a warning and returns without raising" do
        expect(Rails.logger).to receive(:warn).with(/not found/)

        expect {
          job.perform("non-existent-id", payload_json)
        }.not_to raise_error

        expect(ToolEvent.count).to eq(0)
      end
    end

    context "when the payload contains no spans" do
      let(:payload_json) { { "resourceSpans" => [] }.to_json }

      it "does not create any ToolEvents" do
        expect {
          perform
        }.not_to change(ToolEvent, :count)
      end
    end

    context "when a span has no model attribute" do
      let(:payload_json) do
        payload = otlp_payload.deep_dup
        payload["resourceSpans"][0]["scopeSpans"][0]["spans"][0]["attributes"]
          .reject! { |a| a["key"] == "gen_ai.request.model" }
        payload.to_json
      end

      it "skips the span without raising" do
        expect {
          perform
        }.not_to change(ToolEvent, :count)
      end
    end

    context "when the model has no provider prefix (non-namespaced model)" do
      let(:payload_json) do
        payload = otlp_payload.deep_dup
        payload["resourceSpans"][0]["scopeSpans"][0]["spans"][0]["attributes"]
          .find { |a| a["key"] == "gen_ai.request.model" }["value"]["stringValue"] = "gpt-4o"
        payload.to_json
      end

      it "uses the provider_name to build a canonical model slug" do
        perform

        expect(ToolEvent.last.model).to eq("openai/gpt-4o")
      end
    end
  end
end

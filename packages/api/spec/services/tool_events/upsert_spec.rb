# frozen_string_literal: true

require "rails_helper"

RSpec.describe ToolEvents::Upsert do
  describe ".call — cost enrichment" do
    let(:organization) { create(:organization) }
    let(:user) { create(:user) }

    let(:base_attributes) do
      {
        organization_id: organization.id,
        user_id: user.id,
        tool_name: "cursor",
        event_type: "chat",
        model: "gpt-4o",
        tokens_in: 1_000,
        tokens_out: 500,
        occurred_at: Time.current,
        metadata: {}
      }
    end

    context "when client provides cost_usd" do
      let(:attributes) { base_attributes.merge(cost_usd: 0.042) }

      it "does not overwrite the client cost" do
        result = described_class.call(attributes)
        expect(result[:tool_event].cost_usd.to_f).to eq(0.042)
      end

      it "sets cost_source to 'client' in metadata" do
        result = described_class.call(attributes)
        expect(result[:tool_event].metadata["cost_source"]).to eq("client")
      end
    end

    context "when cost_usd is absent and model is present" do
      let(:attributes) { base_attributes.merge(cost_usd: nil) }

      it "calculates cost_usd using MODEL_PRICING" do
        # gpt-4o: input $2.50/M, output $10.00/M
        # 1_000 in → $0.0025, 500 out → $0.005 → total $0.0075
        expected = ModelPricingService.calculate_cost(
          tokens_in: 1_000,
          tokens_out: 500,
          model: "gpt-4o"
        )[:total_cost]

        result = described_class.call(attributes)
        expect(result[:tool_event].cost_usd.to_f).to eq(expected)
      end

      it "sets cost_source to 'server_estimated' in metadata" do
        result = described_class.call(attributes)
        expect(result[:tool_event].metadata["cost_source"]).to eq("server_estimated")
      end
    end

    context "when cost_usd is absent and model is absent (tool fallback)" do
      let(:attributes) { base_attributes.merge(cost_usd: nil, model: nil) }

      it "calculates cost_usd using TOOL_PRICING for the given tool_name" do
        # cursor tool: input $2.00/M, output $8.00/M
        # 1_000 in → $0.002, 500 out → $0.004 → total $0.006
        expected = ModelPricingService.calculate_cost(
          tokens_in: 1_000,
          tokens_out: 500,
          tool: "cursor"
        )[:total_cost]

        result = described_class.call(attributes)
        expect(result[:tool_event].cost_usd.to_f).to eq(expected)
      end

      it "sets cost_source to 'server_estimated' in metadata" do
        result = described_class.call(attributes)
        expect(result[:tool_event].metadata["cost_source"]).to eq("server_estimated")
      end
    end

    context "when cost_usd is zero (treated as absent)" do
      let(:attributes) { base_attributes.merge(cost_usd: 0) }

      it "enriches the cost server-side" do
        result = described_class.call(attributes)
        expect(result[:tool_event].cost_usd.to_f).to be > 0
      end

      it "sets cost_source to 'server_estimated' in metadata" do
        result = described_class.call(attributes)
        expect(result[:tool_event].metadata["cost_source"]).to eq("server_estimated")
      end
    end
  end

  describe ".call — model promotion from metadata" do
    let(:organization) { create(:organization) }
    let(:user) { create(:user) }

    it "promotes model from metadata['model'] when model column is nil" do
      attributes = {
        organization_id: organization.id,
        user_id: user.id,
        tool_name: "claude_code",
        event_type: "chat",
        model: nil,
        tokens_in: 500,
        tokens_out: 200,
        cost_usd: nil,
        occurred_at: Time.current,
        metadata: { "model" => "claude-opus-4-5-20251001", "session_id" => SecureRandom.uuid }
      }
      result = described_class.call(attributes)
      expect(result[:tool_event].model).to eq("claude-opus-4-5-20251001")
    end

    it "enriches cost_usd after model is promoted" do
      attributes = {
        organization_id: organization.id,
        user_id: user.id,
        tool_name: "claude_code",
        event_type: "chat",
        model: nil,
        tokens_in: 500,
        tokens_out: 200,
        cost_usd: nil,
        occurred_at: Time.current,
        metadata: { "model" => "claude-opus-4-5-20251001", "session_id" => SecureRandom.uuid }
      }
      result = described_class.call(attributes)
      expect(result[:tool_event].cost_usd.to_f).to be > 0
      expect(result[:tool_event].metadata["cost_source"]).to eq("server_estimated")
    end

    it "does not overwrite an existing model column value with metadata model" do
      attributes = {
        organization_id: organization.id,
        user_id: user.id,
        tool_name: "claude_code",
        event_type: "chat",
        model: "claude-sonnet-4-6",
        tokens_in: 100,
        tokens_out: 50,
        cost_usd: nil,
        occurred_at: Time.current,
        metadata: { "model" => "some-other-model", "session_id" => SecureRandom.uuid }
      }
      result = described_class.call(attributes)
      expect(result[:tool_event].model).to eq("claude-sonnet-4-6")
    end

    it "does not error when metadata has no model key" do
      attributes = {
        organization_id: organization.id,
        user_id: user.id,
        tool_name: "claude_code",
        event_type: "chat",
        model: nil,
        tokens_in: 0,
        tokens_out: 0,
        cost_usd: nil,
        occurred_at: Time.current,
        metadata: { "session_id" => SecureRandom.uuid }
      }
      expect { described_class.call(attributes) }.not_to raise_error
    end
  end
end

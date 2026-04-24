# frozen_string_literal: true

require "rails_helper"

RSpec.describe ToolEventAttributes, type: :serializer do
  let(:organization) { create(:organization) }
  let(:user) { create(:user) }

  describe "attribution" do
    it 'returns "user" when user_id is present' do
      event = create(:tool_event, organization: organization, user: user)
      data = ToolEventSerializer.new(event).serialize

      expect(data["attribution"]).to eq("user")
    end

    it 'returns "organization" for reconciled events without a user' do
      event = create(:tool_event, organization: organization, user: nil, metadata: { "reconciled" => true })
      data = ToolEventSerializer.new(event).serialize

      expect(data["attribution"]).to eq("organization")
    end

    it 'returns "unknown" for events with no user and no reconciled flag' do
      event = create(:tool_event, organization: organization, user: nil, metadata: {})
      data = ToolEventSerializer.new(event).serialize

      expect(data["attribution"]).to eq("unknown")
    end

    it 'returns "unknown" when metadata is nil' do
      event = create(:tool_event, organization: organization, user: nil, metadata: nil)
      data = ToolEventSerializer.new(event).serialize

      expect(data["attribution"]).to eq("unknown")
    end
  end

  describe "risk_level" do
    it 'returns "high" for cost > $1.00' do
      event = create(:tool_event, organization: organization, user: user, cost_usd: 1.50)
      data = ToolEventSerializer.new(event).serialize

      expect(data["riskLevel"]).to eq("high")
    end

    it 'returns "medium" for cost > $0.10' do
      event = create(:tool_event, organization: organization, user: user, cost_usd: 0.50)
      data = ToolEventSerializer.new(event).serialize

      expect(data["riskLevel"]).to eq("medium")
    end

    it 'returns "low" for cost > $0.01' do
      event = create(:tool_event, organization: organization, user: user, cost_usd: 0.05)
      data = ToolEventSerializer.new(event).serialize

      expect(data["riskLevel"]).to eq("low")
    end

    it 'returns "none" for cost <= $0.01' do
      event = create(:tool_event, organization: organization, user: user, cost_usd: 0.005)
      data = ToolEventSerializer.new(event).serialize

      expect(data["riskLevel"]).to eq("none")
    end

    it 'returns "none" when cost_usd is nil' do
      event = create(:tool_event, organization: organization, user: user, cost_usd: nil)
      data = ToolEventSerializer.new(event).serialize

      expect(data["riskLevel"]).to eq("none")
    end
  end

  describe "token mapping" do
    it "maps tokens_in to inputTokens" do
      event = create(:tool_event, organization: organization, user: user, tokens_in: 250)
      data = ToolEventSerializer.new(event).serialize

      expect(data["inputTokens"]).to eq(250)
    end

    it "maps tokens_out to outputTokens" do
      event = create(:tool_event, organization: organization, user: user, tokens_out: 750)
      data = ToolEventSerializer.new(event).serialize

      expect(data["outputTokens"]).to eq(750)
    end
  end

  describe "cost_cents" do
    it "converts cost_usd to cents" do
      event = create(:tool_event, organization: organization, user: user, cost_usd: 1.23)
      data = ToolEventSerializer.new(event).serialize

      expect(data["costCents"]).to eq(123)
    end

    it "returns nil when cost_usd is nil" do
      event = create(:tool_event, organization: organization, user: user, cost_usd: nil)
      data = ToolEventSerializer.new(event).serialize

      expect(data["costCents"]).to be_nil
    end
  end

  describe "security_findings" do
    it "returns an empty array" do
      event = create(:tool_event, organization: organization, user: user)
      data = ToolEventSerializer.new(event).serialize

      expect(data["securityFindings"]).to eq([])
    end
  end

  describe "concern is shared across serializers" do
    let(:event) { create(:tool_event, organization: organization, user: user, cost_usd: 0.50) }

    it "produces consistent attribution across list and detail serializers" do
      list_data = ToolEventSerializer.new(event).serialize
      detail_data = ToolEventDetailSerializer.new(event).serialize

      expect(list_data["attribution"]).to eq(detail_data["attribution"])
    end

    it "produces consistent risk_level across list and detail serializers" do
      list_data = ToolEventSerializer.new(event).serialize
      detail_data = ToolEventDetailSerializer.new(event).serialize

      expect(list_data["riskLevel"]).to eq(detail_data["riskLevel"])
    end
  end
end

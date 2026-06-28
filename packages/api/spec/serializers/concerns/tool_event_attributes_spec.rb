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
    %w[critical high medium low none].each do |level|
      it "returns #{level.inspect} when metadata risk_level is #{level.inspect}" do
        event = create(:tool_event, organization: organization, user: user, metadata: { "risk_level" => level })
        data = ToolEventSerializer.new(event).serialize

        expect(data["riskLevel"]).to eq(level)
      end
    end

    it 'returns "none" when metadata has no risk_level key' do
      event = create(:tool_event, organization: organization, user: user, metadata: {})
      data = ToolEventSerializer.new(event).serialize

      expect(data["riskLevel"]).to eq("none")
    end

    it 'returns "none" when metadata is nil' do
      event = create(:tool_event, organization: organization, user: user, metadata: nil)
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

  describe "metadata enrichment fields (AIX-261)" do
    it "exposes jiraTicket, prNumber, prUrl and branch from metadata" do
      event = create(:tool_event, organization: organization, user: user, metadata: {
        "jira_ticket" => "AIX-157",
        "pr_number"   => 42,
        "pr_url"      => "https://github.com/acme/demo/pull/42",
        "branch_name" => "feature/AIX-157-foo"
      })
      data = ToolEventSerializer.new(event).serialize

      expect(data["jiraTicket"]).to eq("AIX-157")
      expect(data["prNumber"]).to eq(42)
      expect(data["prUrl"]).to eq("https://github.com/acme/demo/pull/42")
      expect(data["branch"]).to eq("feature/AIX-157-foo")
    end

    it "prefers branch over branch_name" do
      event = create(:tool_event, organization: organization, user: user,
                     metadata: { "branch" => "main", "branch_name" => "feature/x" })
      data = ToolEventSerializer.new(event).serialize

      expect(data["branch"]).to eq("main")
    end

    it "returns nils when metadata is nil" do
      event = create(:tool_event, organization: organization, user: user, metadata: nil)
      data = ToolEventSerializer.new(event).serialize

      expect(data["jiraTicket"]).to be_nil
      expect(data["prNumber"]).to be_nil
      expect(data["prUrl"]).to be_nil
      expect(data["branch"]).to be_nil
    end

    it "exposes the same fields on the detail serializer" do
      event = create(:tool_event, organization: organization, user: user,
                     metadata: { "jira_ticket" => "AIX-1", "pr_number" => 7 })
      detail_data = ToolEventDetailSerializer.new(event).serialize

      expect(detail_data["jiraTicket"]).to eq("AIX-1")
      expect(detail_data["prNumber"]).to eq(7)
    end
  end

  describe "concern is shared across serializers" do
    let(:event) { create(:tool_event, organization: organization, user: user, metadata: { "risk_level" => "medium" }) }

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

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

    context "when cost_model is 'estimated_line_count' (Cursor daily-stats line counts)" do
      let(:line_attrs) do
        base_attributes.merge(
          cost_usd: 0,
          tokens_in: 100,
          tokens_out: 10,
          metadata: { "cost_model" => "estimated_line_count" }
        )
      end

      it "does not re-estimate cost from line counts as tokens" do
        result = described_class.call(line_attrs)
        expect(result[:tool_event].cost_usd.to_f).to eq(0)
      end

      it "sets cost_source to 'client'" do
        result = described_class.call(line_attrs)
        expect(result[:tool_event].metadata["cost_source"]).to eq("client")
      end

      it "nils out tokens_in and tokens_out so line counts do not inflate token aggregations" do
        result = described_class.call(line_attrs)
        expect(result[:tool_event].tokens_in).to be_nil
        expect(result[:tool_event].tokens_out).to be_nil
      end

      it "sets tokens_total to zero" do
        result = described_class.call(line_attrs)
        expect(result[:tool_event].tokens_total).to eq(0)
      end

      it "preserves line counts in metadata as lines_suggested and lines_accepted" do
        result = described_class.call(line_attrs)
        expect(result[:tool_event].metadata["lines_suggested"]).to eq(100)
        expect(result[:tool_event].metadata["lines_accepted"]).to eq(10)
      end

      it "does not re-estimate when cost_usd is nil" do
        result = described_class.call(line_attrs.merge(cost_usd: nil))
        expect(result[:tool_event].metadata["cost_source"]).to eq("client")
        expect(result[:tool_event].tokens_in).to be_nil
        expect(result[:tool_event].tokens_out).to be_nil
      end

      it "preserves a positive client cost untouched" do
        result = described_class.call(line_attrs.merge(cost_usd: 0.00012))
        expect(result[:tool_event].cost_usd.to_f).to eq(0.00012)
        expect(result[:tool_event].metadata["cost_source"]).to eq("client")
        expect(result[:tool_event].tokens_in).to be_nil
        expect(result[:tool_event].tokens_out).to be_nil
      end
    end

    context "when cost_model is provided with a symbol metadata key" do
      let(:symbol_key_attrs) do
        base_attributes.merge(
          cost_usd: 0,
          tokens_in: 100,
          tokens_out: 10,
          metadata: { cost_model: "estimated_line_count" }
        )
      end

      it "resolves the symbol-keyed cost_model and skips token re-estimation" do
        result = described_class.call(symbol_key_attrs)
        expect(result[:tool_event].cost_usd.to_f).to eq(0)
        expect(result[:tool_event].metadata["cost_source"]).to eq("client")
        expect(result[:tool_event].tokens_in).to be_nil
        expect(result[:tool_event].tokens_out).to be_nil
      end
    end

    context "when cost_model is 'estimated_transcript_text' (Cursor char/4 token estimates)" do
      let(:transcript_attrs) do
        base_attributes.merge(
          cost_usd: 0.0021,
          tokens_in: 250,
          tokens_out: 180,
          metadata: { "cost_model" => "estimated_transcript_text" }
        )
      end

      it "nils out the fabricated cost_usd so char/4-derived cost does not inflate cost aggregations" do
        result = described_class.call(transcript_attrs)
        expect(result[:tool_event].cost_usd).to be_nil
      end

      it "sets cost_source to 'client'" do
        result = described_class.call(transcript_attrs)
        expect(result[:tool_event].metadata["cost_source"]).to eq("client")
      end

      it "nils out tokens_in and tokens_out so char/4 estimates do not inflate token aggregations" do
        result = described_class.call(transcript_attrs)
        expect(result[:tool_event].tokens_in).to be_nil
        expect(result[:tool_event].tokens_out).to be_nil
      end

      it "sets tokens_total to zero" do
        result = described_class.call(transcript_attrs)
        expect(result[:tool_event].tokens_total).to eq(0)
      end

      it "preserves char/4 estimates in metadata as tokens_estimated_in and tokens_estimated_out" do
        result = described_class.call(transcript_attrs)
        expect(result[:tool_event].metadata["tokens_estimated_in"]).to eq(250)
        expect(result[:tool_event].metadata["tokens_estimated_out"]).to eq(180)
      end

      it "does not re-estimate when cost_usd is zero" do
        result = described_class.call(transcript_attrs.merge(cost_usd: 0))
        expect(result[:tool_event].metadata["cost_source"]).to eq("client")
        expect(result[:tool_event].tokens_in).to be_nil
      end
    end

    context "estimated-metric relocation on the dedupe-update path (session re-send)" do
      it "nils token columns on the existing row for estimated_line_count re-sends" do
        session_id = SecureRandom.uuid
        described_class.call(
          base_attributes.merge(
            cost_usd: 0.5, tokens_in: 999, tokens_out: 999,
            metadata: { "session_id" => session_id }
          )
        )

        result = described_class.call(
          base_attributes.merge(
            cost_usd: 0.00012, tokens_in: 100, tokens_out: 10,
            metadata: { "session_id" => session_id, "cost_model" => "estimated_line_count" }
          )
        )

        expect(result[:created]).to be(false)
        expect(result[:tool_event].tokens_in).to be_nil
        expect(result[:tool_event].tokens_out).to be_nil
        expect(result[:tool_event].tokens_total).to eq(0)
        expect(result[:tool_event].metadata["lines_suggested"]).to eq(100)
        expect(result[:tool_event].metadata["lines_accepted"]).to eq(10)
        # Line-count cost is a legitimate estimate — preserved on update.
        expect(result[:tool_event].cost_usd.to_f).to eq(0.00012)
      end

      it "nils token columns and fabricated cost on the existing row for transcript re-sends" do
        session_id = SecureRandom.uuid
        described_class.call(
          base_attributes.merge(
            cost_usd: 0.5, tokens_in: 999, tokens_out: 999,
            metadata: { "session_id" => session_id }
          )
        )

        result = described_class.call(
          base_attributes.merge(
            cost_usd: 0.0021, tokens_in: 250, tokens_out: 180,
            metadata: { "session_id" => session_id, "cost_model" => "estimated_transcript_text" }
          )
        )

        expect(result[:created]).to be(false)
        expect(result[:tool_event].tokens_in).to be_nil
        expect(result[:tool_event].tokens_out).to be_nil
        expect(result[:tool_event].tokens_total).to eq(0)
        expect(result[:tool_event].metadata["tokens_estimated_in"]).to eq(250)
        expect(result[:tool_event].metadata["tokens_estimated_out"]).to eq(180)
        # char/4-derived cost is fabricated — nilled on update too.
        expect(result[:tool_event].cost_usd).to be_nil
      end
    end

    context "when model is 'unknown' (unresolved Cursor model)" do
      let(:unknown_model_attrs) do
        base_attributes.merge(
          tool_name: "cursor",
          model: "unknown",
          cost_usd: nil,
          tokens_in: 1_000,
          tokens_out: 500
        )
      end

      it "uses Cursor TOOL_PRICING ($2/$8) not the generic default ($1/$3)" do
        expected = ModelPricingService.calculate_cost(
          tokens_in: 1_000,
          tokens_out: 500,
          tool: "cursor"
        )[:total_cost]

        result = described_class.call(unknown_model_attrs)
        expect(result[:tool_event].cost_usd.to_f).to eq(expected)
      end

      it "sets cost_source to 'server_estimated'" do
        result = described_class.call(unknown_model_attrs)
        expect(result[:tool_event].metadata["cost_source"]).to eq("server_estimated")
      end

      it "does not use generic default pricing ($1/$3) for Cursor unknown-model events" do
        generic_default_cost = ModelPricingService.calculate_cost(
          tokens_in: 1_000,
          tokens_out: 500
        )[:total_cost]

        result = described_class.call(unknown_model_attrs)
        expect(result[:tool_event].cost_usd.to_f).not_to eq(generic_default_cost)
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

  describe ".call — cache-aware cost enrichment (AIX-350)" do
    let(:organization) { create(:organization) }
    let(:user) { create(:user) }

    let(:cache_attributes) do
      {
        organization_id: organization.id,
        user_id: user.id,
        tool_name: "claude_code",
        event_type: "chat",
        model: "claude-sonnet-4",
        tokens_in: 100_000,
        tokens_out: 200_000,
        cost_usd: nil,
        occurred_at: Time.current,
        metadata: {
          "session_id" => SecureRandom.uuid,
          "base_input_tokens" => 100_000,
          "cache_read_tokens" => 900_000,
          "cache_write_tokens" => 0
        }
      }
    end

    it "uses cache_read_tokens from metadata for cost calculation instead of full input rate" do
      result = described_class.call(cache_attributes)
      event = result[:tool_event]

      # With cache-aware pricing:
      # base input: 0.1M * $3.00/M = $0.30
      # output: 0.2M * $15.00/M = $3.00
      # cache_read: 0.9M * $0.30/M = $0.27
      # total = $3.57
      expect(event.cost_usd.to_f).to be_within(0.01).of(3.57)
    end

    it "does not overcharge when cache_read_tokens are present in metadata" do
      # Without cache awareness, all tokens_in would be priced at $3/M input rate
      # tokens_in=100K at $3/M = $0.30. But cache_read_tokens=900K exist in metadata.
      # Naive would price 1M at $3/M = $3.00 input cost (if tokens_in were inflated).
      # Correct is $0.30 input + $0.27 cache = $0.57 for the input side.
      result = described_class.call(cache_attributes)
      event = result[:tool_event]

      naive_input_cost = 1_000_000.0 / 1_000_000 * 3.00  # $3.00
      actual_cost = event.cost_usd.to_f
      expect(actual_cost).to be < naive_input_cost + 3.00  # + output cost
    end

    it "falls back to standard pricing when metadata has no cache breakdown" do
      attrs = cache_attributes.merge(
        metadata: { "session_id" => SecureRandom.uuid }
      )
      result = described_class.call(attrs)
      event = result[:tool_event]

      expected = ModelPricingService.calculate_cost(
        tokens_in: 100_000,
        tokens_out: 200_000,
        model: "claude-sonnet-4"
      )[:total_cost]
      expect(event.cost_usd.to_f).to eq(expected)
    end
  end

  # AIX-519 (regression of AIX-350): server-side normalisation of
  # cache-inflated tokens_in on the standard ingest path.
  describe ".call — cache-inflated tokens_in normalisation (AIX-519)" do
    let(:organization) { create(:organization) }
    let(:user)         { create(:user) }

    # Mirrors the staging event 9e67dae7 pattern (Grace Hopper, 2026-07-01):
    # a stale CLI sends tokens_in = base + cache_read + cache_write while the
    # metadata carries the correct base_input_tokens + cache breakdown.
    let(:inflated_attributes) do
      {
        organization_id: organization.id,
        user_id:         user.id,
        tool_name:       "claude_code",
        event_type:      "chat",
        model:           "claude-sonnet-5",
        tokens_in:       12_680_246, # 455 + 12_650_378 + 29_413
        tokens_out:      16_889,
        cost_usd:        nil,
        occurred_at:     Time.current,
        metadata: {
          "session_id"         => SecureRandom.uuid,
          "transcript_source"  => "claude_jsonl",
          "base_input_tokens"  => 455,
          "cache_read_tokens"  => 12_650_378,
          "cache_write_tokens" => 29_413,
          "output_tokens"      => 16_889
        }
      }
    end

    it "stores tokens_in equal to metadata.base_input_tokens, not the inflated value" do
      event = described_class.call(inflated_attributes)[:tool_event]
      expect(event.tokens_in).to eq(455)
    end

    it "recomputes tokens_total from base input + output (cache excluded)" do
      event = described_class.call(inflated_attributes)[:tool_event]
      expect(event.tokens_total).to eq(455 + 16_889)
    end

    it "prices with cache-aware rates instead of the inflated input count" do
      event = described_class.call(inflated_attributes)[:tool_event]
      # base 455 @ $3/M + output 16_889 @ $15/M + cache_read 12_650_378 @ $0.30/M
      #   + cache_write 29_413 @ $3.75/M ≈ $4.16, far below the pre-fix $12.73.
      expect(event.cost_usd.to_f).to be_within(0.05).of(4.16)
      expect(event.cost_usd.to_f).to be < 12.73
    end

    it "leaves an already-correct payload untouched (tokens_in == base)" do
      attrs = inflated_attributes.merge(tokens_in: 455)
      event = described_class.call(attrs)[:tool_event]
      expect(event.tokens_in).to eq(455)
      expect(event.tokens_total).to eq(455 + 16_889)
    end

    it "does not touch tokens_in when no base_input_tokens is present" do
      attrs = inflated_attributes.merge(
        metadata: { "session_id" => SecureRandom.uuid, "cache_read_tokens" => 900_000 }
      )
      event = described_class.call(attrs)[:tool_event]
      expect(event.tokens_in).to eq(12_680_246)
    end
  end


  describe ".call — model normalisation" do
    let(:organization) { create(:organization) }
    let(:user)         { create(:user) }

    def base_attrs(model:)
      {
        organization_id: organization.id,
        user_id:         user.id,
        tool_name:       "claude_code",
        event_type:      "chat",
        model:           model,
        tokens_in:       100,
        tokens_out:      50,
        cost_usd:        0.001,
        occurred_at:     Time.current,
        metadata:        {}
      }
    end

    it "normalises an XSS payload to 'unknown'" do
      result = described_class.call(base_attrs(model: "<script>alert(1)</script>"))
      expect(result[:tool_event].model).to eq("unknown")
    end

    it "normalises a formula injection string to 'unknown'" do
      result = described_class.call(base_attrs(model: "=cmd|' /C calc'!A0"))
      expect(result[:tool_event].model).to eq("unknown")
    end

    it "preserves a legitimate model name unchanged" do
      result = described_class.call(base_attrs(model: "claude-sonnet-4-6"))
      expect(result[:tool_event].model).to eq("claude-sonnet-4-6")
    end

    it "normalises an XSS payload promoted from metadata to 'unknown'" do
      attrs = base_attrs(model: nil).merge(
        metadata: { "model" => "<script>x</script>", "session_id" => SecureRandom.uuid }
      )
      result = described_class.call(attrs)
      expect(result[:tool_event].model).to eq("unknown")
    end

    it "stores nil when model is absent from both top-level and metadata" do
      result = described_class.call(base_attrs(model: nil))
      expect(result[:tool_event].model).to be_nil
    end
  end

  # Regression guard — AIX-192 validation 2026-06-07
  #
  # Claude Code's MCP transcript-sync path is the *only* ingestion path that can
  # carry a full event (tool_name + event_type + model + tokens + project_id +
  # session_id). Hooks structurally cannot. If this contract breaks server-side,
  # the Events page silently shows blank fields. CI catches the regression here.
  #
  # Parallel TS guard: packages/tools/db90-telemetry-mcp/src/test/claude-payload-contract.test.ts
  describe ".call — Claude Code MCP chat path contract (AIX-192)" do
    let(:organization) { create(:organization) }
    let(:user)         { create(:user) }
    let(:project)      { create(:project, organization: organization) }

    let(:mcp_chat_attributes) do
      {
        organization_id: organization.id,
        user_id:         user.id,
        tool_name:       "claude_code",
        event_type:      "chat",
        model:           "claude-sonnet-4-6",
        tokens_in:       1_500,
        tokens_out:      800,
        cost_usd:        nil, # MCP relies on server enrichment when no pricing table client-side
        project_id:      project.id,
        occurred_at:     Time.current,
        metadata: {
          "session_id"        => SecureRandom.uuid,
          "claude_session_id" => SecureRandom.uuid,
          "transcript_source" => "claude_jsonl",
          "model"             => "claude-sonnet-4-6",
          "scannable"         => true
        }
      }
    end

    it "persists tool_name=claude_code" do
      event = described_class.call(mcp_chat_attributes)[:tool_event]
      expect(event.tool_name).to eq("claude_code")
    end

    it "persists event_type=chat (NOT 'prompt' — that's a UI-only filter value, not a server enum)" do
      event = described_class.call(mcp_chat_attributes)[:tool_event]
      expect(event.event_type).to eq("chat")
    end

    it "persists the model column from the top-level attribute" do
      event = described_class.call(mcp_chat_attributes)[:tool_event]
      expect(event.model).to eq("claude-sonnet-4-6")
    end

    it "preserves tokens_in and tokens_out exactly as posted" do
      event = described_class.call(mcp_chat_attributes)[:tool_event]
      expect(event.tokens_in).to eq(1_500)
      expect(event.tokens_out).to eq(800)
    end

    it "enriches cost_usd > 0 server-side when client did not send a cost" do
      event = described_class.call(mcp_chat_attributes)[:tool_event]
      expect(event.cost_usd.to_f).to be > 0
      expect(event.metadata["cost_source"]).to eq("server_estimated")
    end

    it "preserves project_id so the Events page shows the project name (NOT '-')" do
      event = described_class.call(mcp_chat_attributes)[:tool_event]
      expect(event.project_id).to eq(project.id)
    end

    it "preserves the MCP transcript_source so the path is distinguishable from hook events" do
      event = described_class.call(mcp_chat_attributes)[:tool_event]
      expect(event.metadata["transcript_source"]).to eq("claude_jsonl")
    end

    it "respects client-provided cost_usd when present (e.g. when client used a pricing table)" do
      attrs = mcp_chat_attributes.merge(cost_usd: 0.0123)
      event = described_class.call(attrs)[:tool_event]
      expect(event.cost_usd.to_f).to eq(0.0123)
      expect(event.metadata["cost_source"]).to eq("client")
    end
  end

  describe ".call — auto membership on update path" do
    let(:organization) { create(:organization) }
    let(:user) { create(:user) }
    let(:project) { create(:project, organization: organization) }
    let(:session_id) { SecureRandom.uuid }

    before { create(:organization_membership, user: user, organization: organization) }

    it "does not duplicate membership when existing event with project is updated" do
      attrs = {
        organization_id: organization.id,
        user_id: user.id,
        tool_name: "cursor",
        event_type: "chat",
        model: "gpt-4o",
        tokens_in: 10,
        tokens_out: 20,
        occurred_at: Time.current,
        project_id: project.id,
        metadata: { "session_id" => session_id }
      }

      described_class.call(attrs)

      expect {
        described_class.call(attrs.merge(tokens_in: 999))
      }.not_to change(ProjectMembership, :count)
      expect(ProjectMembership.count).to eq(1)
    end

    it "creates project membership when project_id appears on a deduplicated update" do
      first_attributes = {
        organization_id: organization.id,
        user_id: user.id,
        tool_name: "cursor",
        event_type: "chat",
        model: "gpt-4o",
        tokens_in: 10,
        tokens_out: 20,
        occurred_at: Time.current,
        metadata: { "session_id" => session_id }
      }

      second_attributes = first_attributes.merge(
        project_id: project.id,
        metadata: { "session_id" => session_id, "update" => "with_project" }
      )

      described_class.call(first_attributes)

      expect {
        described_class.call(second_attributes)
      }.to change(ProjectMembership, :count).by(1)
    end
  end

  # AIX-260 — server-side event_type re-tagging for pre-T-02 CLIs
  describe ".call — event_type normalization (AIX-260)" do
    let(:organization) { create(:organization) }
    let(:user)         { create(:user) }

    let(:base_attributes) do
      {
        organization_id: organization.id,
        user_id: user.id,
        tool_name: "cursor",
        event_type: "chat",
        model: "gpt-4o",
        tokens_in: 100,
        tokens_out: 50,
        cost_usd: 0.01,
        occurred_at: Time.current,
        metadata: {}
      }
    end

    context "when a chat event carries recent_commit metadata" do
      let(:attributes) do
        base_attributes.merge(metadata: { "source" => "recent_commit" })
      end

      it "re-tags event_type to commit" do
        event = described_class.call(attributes)[:tool_event]
        expect(event.event_type).to eq("commit")
      end

      it "stamps renormalized_from and renormalized_by in metadata" do
        event = described_class.call(attributes)[:tool_event]
        expect(event.metadata["renormalized_from"]).to eq("chat")
        expect(event.metadata["renormalized_by"]).to eq("server_v1")
      end

      it "preserves cost_source stamping alongside the renormalized keys" do
        event = described_class.call(attributes)[:tool_event]
        expect(event.metadata["cost_source"]).to eq("client")
      end

      it "leaves tokens and cost untouched" do
        event = described_class.call(attributes)[:tool_event]
        expect(event.tokens_in).to eq(100)
        expect(event.tokens_out).to eq(50)
        expect(event.cost_usd.to_f).to eq(0.01)
      end
    end

    context "when a chat event carries a git commit bash_command" do
      it "re-tags event_type to commit" do
        attrs = base_attributes.merge(metadata: { "bash_command" => "git commit -m 'wip'" })
        event = described_class.call(attrs)[:tool_event]
        expect(event.event_type).to eq("commit")
        expect(event.metadata["renormalized_from"]).to eq("chat")
      end
    end

    context "when a chat event carries a test-runner bash_command" do
      it "re-tags event_type to test" do
        attrs = base_attributes.merge(metadata: { "bash_command" => "bundle exec rspec spec/" })
        event = described_class.call(attrs)[:tool_event]
        expect(event.event_type).to eq("test")
        expect(event.metadata["renormalized_from"]).to eq("chat")
      end
    end

    context "when the feature flag is off" do
      before do
        stub_const("ENV", ENV.to_h.merge("DB90_EVENT_TYPE_RENORMALIZATION" => "false"))
      end

      it "persists event_type chat as sent, with no renormalized_* keys" do
        attrs = base_attributes.merge(metadata: { "source" => "recent_commit" })
        event = described_class.call(attrs)[:tool_event]
        expect(event.event_type).to eq("chat")
        expect(event.metadata).not_to have_key("renormalized_from")
        expect(event.metadata).not_to have_key("renormalized_by")
      end
    end

    context "when the event is already finely typed" do
      it "passes a commit event through without renormalized_* keys" do
        attrs = base_attributes.merge(
          event_type: "commit",
          metadata: { "source" => "recent_commit" }
        )
        event = described_class.call(attrs)[:tool_event]
        expect(event.event_type).to eq("commit")
        expect(event.metadata).not_to have_key("renormalized_from")
        expect(event.metadata).not_to have_key("renormalized_by")
      end
    end

    context "when no rule matches a chat event" do
      it "persists chat unchanged without renormalized_* keys" do
        attrs = base_attributes.merge(metadata: { "session_id" => SecureRandom.uuid })
        event = described_class.call(attrs)[:tool_event]
        expect(event.event_type).to eq("chat")
        expect(event.metadata).not_to have_key("renormalized_from")
      end
    end

    context "on the dedupe-update path (same session_id re-send)" do
      it "never flips an existing row's event_type (event_type not in MUTABLE_FIELDS)" do
        session_id = SecureRandom.uuid
        first = base_attributes.merge(
          metadata: { "session_id" => session_id }
        )
        existing = described_class.call(first)[:tool_event]
        expect(existing.event_type).to eq("chat")

        resend = base_attributes.merge(
          tokens_in: 200,
          metadata: { "session_id" => session_id, "source" => "recent_commit" }
        )
        result = described_class.call(resend)
        expect(result[:created]).to be(false)
        expect(result[:tool_event].id).to eq(existing.id)
        expect(result[:tool_event].event_type).to eq("chat")
      end

      it "never stamps renormalized_* metadata onto the existing row" do
        session_id = SecureRandom.uuid
        first = base_attributes.merge(
          metadata: { "session_id" => session_id }
        )
        existing = described_class.call(first)[:tool_event]

        resend = base_attributes.merge(
          metadata: { "session_id" => session_id, "source" => "recent_commit" }
        )
        result = described_class.call(resend)
        expect(result[:tool_event].id).to eq(existing.id)
        expect(result[:tool_event].metadata).not_to have_key("renormalized_from")
        expect(result[:tool_event].metadata).not_to have_key("renormalized_by")
      end
    end

    context "when a client sends forged renormalized_* metadata" do
      it "strips reserved keys from a non-re-tagged event" do
        attrs = base_attributes.merge(
          event_type: "commit",
          metadata: { "renormalized_from" => "chat", "renormalized_by" => "server_v1" }
        )
        event = described_class.call(attrs)[:tool_event]
        expect(event.metadata).not_to have_key("renormalized_from")
        expect(event.metadata).not_to have_key("renormalized_by")
      end

      it "strips symbol-keyed reserved keys" do
        attrs = base_attributes.merge(
          event_type: "commit",
          metadata: { renormalized_from: "chat", renormalized_by: "server_v1" }
        )
        event = described_class.call(attrs)[:tool_event]
        expect(event.metadata).not_to have_key("renormalized_from")
        expect(event.metadata).not_to have_key("renormalized_by")
      end

      it "strips reserved keys even when the feature flag is off" do
        stub_const("ENV", ENV.to_h.merge("DB90_EVENT_TYPE_RENORMALIZATION" => "false"))
        attrs = base_attributes.merge(
          event_type: "commit",
          metadata: { "renormalized_by" => "server_v1" }
        )
        event = described_class.call(attrs)[:tool_event]
        expect(event.metadata).not_to have_key("renormalized_by")
      end

      it "re-stamps genuine provenance after stripping a forged value" do
        attrs = base_attributes.merge(
          metadata: { "source" => "recent_commit", "renormalized_from" => "completion" }
        )
        event = described_class.call(attrs)[:tool_event]
        expect(event.event_type).to eq("commit")
        expect(event.metadata["renormalized_from"]).to eq("chat")
      end
    end

    context "with non-canonical feature-flag spellings" do
      it "treats '0' as off" do
        stub_const("ENV", ENV.to_h.merge("DB90_EVENT_TYPE_RENORMALIZATION" => "0"))
        attrs = base_attributes.merge(metadata: { "source" => "recent_commit" })
        expect(described_class.call(attrs)[:tool_event].event_type).to eq("chat")
      end

      it "treats 'FALSE' as off" do
        stub_const("ENV", ENV.to_h.merge("DB90_EVENT_TYPE_RENORMALIZATION" => "FALSE"))
        attrs = base_attributes.merge(metadata: { "source" => "recent_commit" })
        expect(described_class.call(attrs)[:tool_event].event_type).to eq("chat")
      end

      it "treats 'TRUE' as on" do
        stub_const("ENV", ENV.to_h.merge("DB90_EVENT_TYPE_RENORMALIZATION" => "TRUE"))
        attrs = base_attributes.merge(metadata: { "source" => "recent_commit" })
        expect(described_class.call(attrs)[:tool_event].event_type).to eq("commit")
      end
    end
  end

  describe ".call — jira_ticket extraction (AIX-261)" do
    let(:organization) { create(:organization) }
    let(:user)         { create(:user) }

    let(:base_attributes) do
      {
        organization_id: organization.id,
        user_id: user.id,
        tool_name: "cursor",
        event_type: "commit",
        model: "gpt-4o",
        tokens_in: 100,
        tokens_out: 50,
        cost_usd: 0.01,
        occurred_at: Time.current,
        metadata: {}
      }
    end

    it "stamps jira_ticket on the direct-create path" do
      attrs = base_attributes.merge(metadata: { "branch_name" => "feature/AIX-157-foo" })
      event = described_class.call(attrs)[:tool_event]
      expect(event.metadata["jira_ticket"]).to eq("AIX-157")
    end

    it "stamps jira_ticket on the locked create path (session_id present)" do
      attrs = base_attributes.merge(
        metadata: { "session_id" => SecureRandom.uuid, "branch_name" => "feature/AIX-8-bar" }
      )
      result = described_class.call(attrs)
      expect(result[:created]).to be(true)
      expect(result[:tool_event].metadata["jira_ticket"]).to eq("AIX-8")
    end

    it "adds no jira_ticket key when nothing matches" do
      attrs = base_attributes.merge(metadata: { "branch_name" => "main" })
      event = described_class.call(attrs)[:tool_event]
      expect(event.metadata).not_to have_key("jira_ticket")
    end

    it "preserves a client-supplied non-blank jira_ticket" do
      attrs = base_attributes.merge(
        metadata: { "jira_ticket" => "CLIENT-99", "branch_name" => "feature/AIX-1-x" }
      )
      event = described_class.call(attrs)[:tool_event]
      expect(event.metadata["jira_ticket"]).to eq("CLIENT-99")
    end

    it "overrides a blank client-supplied jira_ticket" do
      attrs = base_attributes.merge(
        metadata: { "jira_ticket" => "", "branch_name" => "feature/AIX-1-x" }
      )
      event = described_class.call(attrs)[:tool_event]
      expect(event.metadata["jira_ticket"]).to eq("AIX-1")
    end

    it "drops an invalid client-supplied jira_ticket and falls back to extraction (review decision D4)" do
      attrs = base_attributes.merge(
        metadata: { "jira_ticket" => "<img src=x onerror=alert(1)>", "branch_name" => "feature/AIX-1-x" }
      )
      event = described_class.call(attrs)[:tool_event]
      expect(event.metadata["jira_ticket"]).to eq("AIX-1")
    end

    it "drops an invalid client-supplied jira_ticket entirely when nothing matches" do
      attrs = base_attributes.merge(
        metadata: { "jira_ticket" => "not a ticket!", "branch_name" => "main" }
      )
      event = described_class.call(attrs)[:tool_event]
      expect(event.metadata).not_to have_key("jira_ticket")
    end

    it "uppercases a lowercase client-supplied jira_ticket" do
      attrs = base_attributes.merge(metadata: { "jira_ticket" => "client-99" })
      event = described_class.call(attrs)[:tool_event]
      expect(event.metadata["jira_ticket"]).to eq("CLIENT-99")
    end

    it "respects a symbol-keyed client-supplied jira_ticket" do
      attrs = base_attributes.merge(
        metadata: { jira_ticket: "CLIENT-7", branch_name: "feature/AIX-1-x" }
      )
      event = described_class.call(attrs)[:tool_event]
      # JSONB round-trip stringifies keys — the stored value must be the client's
      expect(event.reload.metadata["jira_ticket"]).to eq("CLIENT-7")
    end

    it "never stamps on the dedupe-update path" do
      session_id = SecureRandom.uuid
      existing = described_class.call(
        base_attributes.merge(metadata: { "session_id" => session_id })
      )[:tool_event]
      expect(existing.metadata).not_to have_key("jira_ticket")

      resend = base_attributes.merge(
        metadata: { "session_id" => session_id, "branch_name" => "feature/AIX-9-z" }
      )
      result = described_class.call(resend)
      expect(result[:created]).to be(false)
      expect(result[:tool_event].id).to eq(existing.id)
      expect(result[:tool_event].reload.metadata).not_to have_key("jira_ticket")
    end

    it "coexists with renormalization stamps on chat→commit re-tags" do
      attrs = base_attributes.merge(
        event_type: "chat",
        metadata: { "source" => "recent_commit", "branch_name" => "feature/AIX-3-y" }
      )
      event = described_class.call(attrs)[:tool_event]
      expect(event.event_type).to eq("commit")
      expect(event.metadata["renormalized_from"]).to eq("chat")
      expect(event.metadata["jira_ticket"]).to eq("AIX-3")
      expect(event.metadata["cost_source"]).to eq("client")
    end
  end

  describe ".call — PR correlation enqueue (AIX-261)" do
    let(:organization) { create(:organization) }
    let(:user)         { create(:user) }

    let(:base_attributes) do
      {
        organization_id: organization.id,
        user_id: user.id,
        tool_name: "cursor",
        event_type: "commit",
        cost_usd: 0.01,
        occurred_at: Time.current,
        metadata: { "commit_hash" => "abc123" }
      }
    end

    it "enqueues PrCorrelationJob after creating a commit event with a commit_hash" do
      expect {
        described_class.call(base_attributes)
      }.to have_enqueued_job(PrCorrelationJob)
    end

    it "enqueues with the created event's id" do
      result = nil
      expect {
        result = described_class.call(base_attributes)
      }.to have_enqueued_job(PrCorrelationJob).with { |id|
        expect(id).to eq(result[:tool_event].id)
      }
    end

    it "enqueues when the hash arrives under the sha key" do
      attrs = base_attributes.merge(metadata: { "sha" => "fff999" })
      expect { described_class.call(attrs) }.to have_enqueued_job(PrCorrelationJob)
    end

    it "falls back to sha when commit_hash is present but blank" do
      attrs = base_attributes.merge(metadata: { "commit_hash" => "", "sha" => "fff999" })
      expect { described_class.call(attrs) }.to have_enqueued_job(PrCorrelationJob)
    end

    it "enqueues for a chat event re-tagged to commit by the normalizer" do
      attrs = base_attributes.merge(
        event_type: "chat",
        metadata: { "source" => "recent_commit", "commit_hash" => "abc123" }
      )
      expect { described_class.call(attrs) }.to have_enqueued_job(PrCorrelationJob)
    end

    it "does not enqueue for non-commit events" do
      attrs = base_attributes.merge(event_type: "chat")
      expect { described_class.call(attrs) }.not_to have_enqueued_job(PrCorrelationJob)
    end

    it "does not enqueue without a commit hash" do
      attrs = base_attributes.merge(metadata: { "branch_name" => "main" })
      expect { described_class.call(attrs) }.not_to have_enqueued_job(PrCorrelationJob)
    end

    it "does not enqueue on the dedupe-update path" do
      session_id = SecureRandom.uuid
      attrs = base_attributes.merge(metadata: { "session_id" => session_id, "commit_hash" => "abc123" })
      described_class.call(attrs)

      expect { described_class.call(attrs) }.not_to have_enqueued_job(PrCorrelationJob)
    end

    it "does not enqueue when DB90_PR_CORRELATION is off" do
      stub_const("ENV", ENV.to_h.merge("DB90_PR_CORRELATION" => "false"))
      expect { described_class.call(base_attributes) }.not_to have_enqueued_job(PrCorrelationJob)
    end

    it "enqueues when DB90_PR_CORRELATION is explicitly on" do
      stub_const("ENV", ENV.to_h.merge("DB90_PR_CORRELATION" => "true"))
      expect { described_class.call(base_attributes) }.to have_enqueued_job(PrCorrelationJob)
    end
  end

  describe ".call — reserved pr_* metadata keys (AIX-261)" do
    let(:organization) { create(:organization) }
    let(:user)         { create(:user) }

    let(:base_attributes) do
      {
        organization_id: organization.id,
        user_id: user.id,
        tool_name: "cursor",
        event_type: "commit",
        cost_usd: 0.01,
        occurred_at: Time.current,
        metadata: {}
      }
    end

    it "strips forged pr_* keys from incoming metadata" do
      attrs = base_attributes.merge(
        metadata: {
          "pr_number" => 666, "pr_url" => "https://evil.example", "pr_state" => "open",
          "pr_lookup_status" => "not_found", "branch_name" => "main"
        }
      )
      event = described_class.call(attrs)[:tool_event]
      expect(event.metadata.keys).not_to include("pr_number", "pr_url", "pr_state", "pr_lookup_status")
      expect(event.metadata["branch_name"]).to eq("main")
    end

    it "strips symbol-keyed pr_* keys" do
      attrs = base_attributes.merge(
        metadata: { pr_number: 1, pr_url: "https://evil.example" }
      )
      event = described_class.call(attrs)[:tool_event]
      expect(event.reload.metadata.keys).not_to include("pr_number", "pr_url")
    end
  end

  describe "prompt_text / assistant_text metadata stripping (AIX-263)" do
    let(:organization) { create(:organization) }
    let(:user)         { create(:user) }

    let(:base_attributes) do
      {
        organization_id: organization.id,
        user_id: user.id,
        tool_name: "claude_code",
        event_type: "chat",
        occurred_at: Time.current,
        metadata: {
          "session_id" => nil,
          "prompt_text" => "How do I reverse a string?",
          "assistant_text" => "Use .reverse",
          "other_key" => "should remain"
        }
      }
    end

    it "strips prompt_text from tool_events.metadata" do
      result = described_class.call(base_attributes)
      expect(result[:tool_event].metadata).not_to have_key("prompt_text")
    end

    it "strips assistant_text from tool_events.metadata" do
      result = described_class.call(base_attributes)
      expect(result[:tool_event].metadata).not_to have_key("assistant_text")
    end

    it "preserves unrelated metadata keys" do
      result = described_class.call(base_attributes)
      expect(result[:tool_event].metadata["other_key"]).to eq("should remain")
    end
  end
end

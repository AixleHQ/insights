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
end

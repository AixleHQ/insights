# frozen_string_literal: true

require "rails_helper"

RSpec.describe ToolEventCsvExporter do
  describe ".csv_safe" do
    it "returns nil unchanged" do
      expect(described_class.csv_safe(nil)).to be_nil
    end

    it "returns a safe string unchanged" do
      expect(described_class.csv_safe("claude-sonnet-4-6")).to eq("claude-sonnet-4-6")
    end

    it "prefixes = with a single quote" do
      expect(described_class.csv_safe("=HYPERLINK()")).to eq("'=HYPERLINK()")
    end

    it "prefixes + with a single quote" do
      expect(described_class.csv_safe("+1")).to eq("'+1")
    end

    it "does NOT prefix - (not a formula trigger; would corrupt names like -preview-model)" do
      expect(described_class.csv_safe("-preview-model")).to eq("-preview-model")
    end

    it "prefixes @ with a single quote" do
      expect(described_class.csv_safe("@SUM(A1)")).to eq("'@SUM(A1)")
    end

    it "prefixes a leading tab with a single quote" do
      expect(described_class.csv_safe("\tcmd")).to eq("'\tcmd")
    end
  end

  describe ".generate" do
    let(:organization) { create(:organization) }
    let(:user)         { create(:user, email: "alice@example.com") }

    let(:event) do
      create(:tool_event,
             organization: organization,
             user:         user,
             tool_name:    "cursor",
             event_type:   "chat",
             model:        "gpt-4o",
             tokens_in:    100,
             tokens_out:   50,
             cost_usd:     0.001,
             occurred_at:  Time.zone.parse("2030-01-15T10:00:00Z"),
             metadata:     { "session_id" => "sess-abc123", "risk_level" => "none" })
    end

    let(:events) { ToolEvent.where(id: event.id) }

    it "generates CSV with MEMBER_HEADERS for :member role" do
      csv = described_class.generate(events, :member)
      headers = CSV.parse(csv).first
      expect(headers).to eq(ToolEventCsvExporter::MEMBER_HEADERS)
    end

    it "generates CSV with ORG_ADMIN_HEADERS for :org_admin role" do
      csv = described_class.generate(events, :org_admin)
      headers = CSV.parse(csv).first
      expect(headers).to eq(ToolEventCsvExporter::ORG_ADMIN_HEADERS)
    end

    it "generates CSV with GLOBAL_ADMIN_HEADERS for :global_admin role" do
      csv = described_class.generate(events, :global_admin)
      headers = CSV.parse(csv).first
      expect(headers).to eq(ToolEventCsvExporter::GLOBAL_ADMIN_HEADERS)
    end

    context "with a formula-injection model string in the DB (legacy row)" do
      let(:event) do
        create(:tool_event,
               organization: organization,
               user:         user,
               tool_name:    "cursor",
               event_type:   "chat",
               model:        "gpt-4o",
               tokens_in:    10,
               tokens_out:   5,
               cost_usd:     0.0,
               occurred_at:  Time.current,
               metadata:     { "session_id" => "sess-xyz" })
      end

      before do
        # Simulate a pre-fix legacy row by bypassing AR validations
        event.update_columns(model: "=DANGEROUS")
      end

      it "neutralises the formula injection in the model cell" do
        csv = described_class.generate(events, :global_admin)
        rows = CSV.parse(csv)
        data_row = rows[1]
        model_index = ToolEventCsvExporter::GLOBAL_ADMIN_HEADERS.index("model")
        expect(data_row[model_index]).to eq("'=DANGEROUS")
      end
    end

    context "when filter_summary_lines are provided" do
      it "includes the preamble before the headers" do
        csv = described_class.generate(events, :member, filter_summary_lines: [ "Applied filters", "Tool: cursor" ])
        rows = CSV.parse(csv)
        expect(rows[0][0]).to eq("Applied filters")
        expect(rows[1][0]).to eq("Tool: cursor")
        expect(rows[3]).to eq(ToolEventCsvExporter::MEMBER_HEADERS)
      end
    end
  end

  describe ".filter_summary_lines_for_export" do
    it "returns nil when no relevant filter params are present" do
      expect(described_class.filter_summary_lines_for_export({})).to be_nil
    end

    it "builds a summary line for model filter" do
      result = described_class.filter_summary_lines_for_export({ "model" => "gpt-4o" })
      expect(result).to include("Model: gpt-4o")
    end

    it "includes all present filter lines" do
      result = described_class.filter_summary_lines_for_export({
        "tool_name"  => "cursor",
        "event_type" => "chat",
        "model"      => "gpt-4o",
        "start_date" => "2030-01-01",
        "end_date"   => "2030-01-31"
      })
      expect(result).to eq([
        "Applied filters",
        "Tool: cursor",
        "Event type: chat",
        "Model: gpt-4o",
        "From: 2030-01-01",
        "To: 2030-01-31"
      ])
    end
  end
end

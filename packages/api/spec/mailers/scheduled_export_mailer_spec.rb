# frozen_string_literal: true

require "rails_helper"

RSpec.describe ScheduledExportMailer, type: :mailer do
  let(:organization) { create(:organization, name: "Acme Corp") }
  let(:owner)        { create(:user) }
  let(:export) do
    create(:scheduled_export, organization: organization, created_by: owner,
           report_type: "cost_by_tool", format: "csv", frequency: "daily",
           recipients: [ "analyst@example.com" ])
  end

  let(:report) do
    AggregatedReportQueryBuilder::Result.new(
      rows: [ { "tool_name" => "claude", "total_cost_usd" => "1.23",
                "total_tokens" => "500", "event_count" => "10" } ],
      columns: %w[tool_name total_cost_usd total_tokens event_count]
    )
  end

  describe "#export_report" do
    subject(:mail) { described_class.export_report(export, report) }

    it "renders without raising ActionView::MissingTemplate" do
      expect { mail.body }.not_to raise_error
    end

    it "sends to the export recipients" do
      expect(mail.to).to eq([ "analyst@example.com" ])
    end

    it "sets subject with org name and report type" do
      expect(mail.subject).to eq("Acme Corp — Cost by tool Report")
    end

    it "attaches a CSV file" do
      expect(mail.attachments.size).to eq(1)
      expect(mail.attachments.first.filename).to match(/\Adb90-report-cost_by_tool-.*\.csv\z/)
      expect(mail.attachments.first.mime_type).to eq("text/csv")
    end

    it "CSV attachment contains report data" do
      csv_content = mail.attachments.first.decoded
      expect(csv_content).to include("claude")
    end

    context "with json format" do
      let(:export) do
        create(:scheduled_export, :json_format, organization: organization, created_by: owner,
               report_type: "cost_by_tool", frequency: "daily",
               recipients: [ "analyst@example.com" ])
      end

      it "attaches a JSON file with correct mime type" do
        expect(mail.attachments.first.mime_type).to eq("application/json")
        expect(mail.attachments.first.filename).to match(/\.json\z/)
      end
    end
  end
end

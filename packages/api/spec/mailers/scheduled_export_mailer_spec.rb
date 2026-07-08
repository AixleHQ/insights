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
      expect(mail.attachments.first.filename).to match(/\Aacme-corp-report-cost_by_tool-.*\.csv\z/)
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

    describe "HTML email" do
      subject(:mail) { described_class.export_report(export, report) }

      it "is a single well-formed HTML document (no nested layout)" do
        html = mail.html_part.body.decoded

        expect(html.scan(/<!DOCTYPE/i).size).to eq(1)
        expect(html.scan(/<html/i).size).to eq(1)
        expect(html.scan(/<body/i).size).to eq(1)
      end

      it "includes the Aixle Insights brand name" do
        expect(mail.html_part.body.decoded).to include("Aixle Insights")
      end

      it "includes the report type in the heading" do
        expect(mail.html_part.body.decoded).to include("Cost by tool")
      end

      it "includes the organization name" do
        expect(mail.html_part.body.decoded).to include("Acme Corp")
      end

      it "includes format, frequency, and generated-at metadata" do
        html = mail.html_part.body.decoded
        expect(html).to include("CSV")
        expect(html).to include("Daily")
        expect(html).to match(/\d{4}-\d{2}-\d{2}/)
      end

      it "has the branded card structure" do
        html = mail.html_part.body.decoded
        expect(html).to include('class="card"')
        expect(html).to include('class="logo-text"')
        expect(html).to include('class="footer"')
      end
    end
  end
end

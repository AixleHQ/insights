# frozen_string_literal: true

require "rails_helper"

RSpec.describe ExportReportFilename do
  let(:organization) { build(:organization, name: "Acme Corp") }

  it "builds an org-scoped filename without db90 branding" do
    filename = described_class.build(
      organization: organization,
      report_type:  "token_by_user",
      format:       "json",
      date:         Date.new(2026, 6, 30)
    )

    expect(filename).to eq("acme-corp-report-token_by_user-2026-06-30.json")
    expect(filename).not_to include("db90")
  end
end

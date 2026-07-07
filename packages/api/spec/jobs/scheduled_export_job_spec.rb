# frozen_string_literal: true

require "rails_helper"

RSpec.describe ScheduledExportJob, type: :job do
  let(:organization) { create(:organization) }
  let(:owner)        { create(:user) }

  before do
    create(:organization_membership, user: owner, organization: organization, role: "owner")
  end

  let(:mailer_double) { instance_double(ActionMailer::MessageDelivery, deliver_now: true) }

  before do
    allow(ScheduledExportMailer).to receive(:export_report).and_return(mailer_double)
  end

  describe "#perform" do
    context "with an active, overdue export" do
      let!(:export) do
        create(:scheduled_export, :overdue, organization: organization, created_by: owner)
      end

      it "calls ScheduledExportMailer.export_report with the export and report" do
        described_class.new.perform
        expect(ScheduledExportMailer).to have_received(:export_report).once
      end

      it "advances next_run_at after delivery" do
        original_next_run = export.next_run_at
        described_class.new.perform
        expect(export.reload.next_run_at).to be > original_next_run
        expect(export.reload.last_run_at).to be_present
      end
    end

    context "with an export not yet due" do
      let!(:future_export) do
        create(:scheduled_export, organization: organization, created_by: owner,
               next_run_at: 2.hours.from_now)
      end

      it "does not process exports that are not yet due" do
        described_class.new.perform
        expect(ScheduledExportMailer).not_to have_received(:export_report)
      end
    end

    context "with an inactive export" do
      let!(:inactive_export) do
        create(:scheduled_export, :inactive, :overdue, organization: organization, created_by: owner)
      end

      it "skips inactive exports" do
        described_class.new.perform
        expect(ScheduledExportMailer).not_to have_received(:export_report)
      end
    end

    context "when an export raises an error" do
      let!(:export) do
        create(:scheduled_export, :overdue, organization: organization, created_by: owner)
      end

      before do
        allow(ScheduledExportMailer).to receive(:export_report).and_raise(StandardError, "SMTP failure")
      end

      it "logs the error and continues without raising" do
        expect(Rails.logger).to receive(:error).with(/ScheduledExportJob.*Failed/)
        expect { described_class.new.perform }.not_to raise_error
      end

      it "does not advance next_run_at when delivery fails" do
        allow(Rails.logger).to receive(:error)
        original_next_run = export.next_run_at
        described_class.new.perform
        expect(export.reload.next_run_at).to eq(original_next_run)
      end
    end

    context "with multiple due exports" do
      let!(:export1) { create(:scheduled_export, :overdue, organization: organization, created_by: owner) }
      let!(:export2) { create(:scheduled_export, :overdue, organization: organization, created_by: owner) }

      it "processes all due exports" do
        described_class.new.perform
        expect(ScheduledExportMailer).to have_received(:export_report).twice
      end
    end
  end
end

# frozen_string_literal: true

require "rails_helper"

RSpec.describe PostSyncClassificationJob, type: :job do
  subject(:job) { described_class.new }

  let(:organization) { create(:organization) }
  let(:user) { create(:user) }

  before do
    create(:organization_membership, user: user, organization: organization)
  end

  describe "#perform" do
    context "events with metadata risk_level but no audit_log" do
      it "creates audit_logs from metadata risk_level" do
        event = create(:tool_event, organization: organization, user: user,
                       tool_name: "claude_code", occurred_at: 1.hour.ago,
                       metadata: { "risk_level" => "high", "risk_score" => 4 })

        expect { job.perform }.to change(AuditLog, :count).by_at_least(1)

        audit = AuditLog.find_by(tool_event_id: event.id)
        expect(audit).to be_present
        expect(audit.risk_level).to eq("high")
        expect(audit.organization_id).to eq(organization.id)
        expect(audit.metadata).to include("source" => "post_sync_classification")
      end

      it "maps invalid risk_level to 'none'" do
        event = create(:tool_event, organization: organization, user: user,
                       tool_name: "cursor", occurred_at: 1.hour.ago,
                       metadata: { "risk_level" => "unknown_value" })

        job.perform

        audit = AuditLog.find_by(tool_event_id: event.id)
        expect(audit.risk_level).to eq("none")
      end

      it "skips events with metadata risk_level 'none'" do
        event = create(:tool_event, organization: organization, user: user,
                       tool_name: "cursor", occurred_at: 1.hour.ago,
                       metadata: { "risk_level" => "none" })

        job.perform

        audit = AuditLog.find_by(tool_event_id: event.id)
        expect(audit).to be_present
        expect(audit.risk_level).to eq("none")
        expect(audit.metadata).to include("no_content" => true)
      end
    end

    context "provider-polled events (no metadata risk_level)" do
      it "creates audit_logs with risk_level 'none'" do
        event = create(:tool_event, organization: organization, user: user,
                       tool_name: "openrouter_api", occurred_at: 2.days.ago,
                       metadata: { "external_id" => "gen-abc", "connector_id" => "123" })

        job.perform

        audit = AuditLog.find_by(tool_event_id: event.id)
        expect(audit).to be_present
        expect(audit.risk_level).to eq("none")
        expect(audit.confidence_score).to eq(1.0)
        expect(audit.metadata).to include("no_content" => true)
      end

      it "skips events older than 30 days" do
        old_event = create(:tool_event, organization: organization, user: user,
                           tool_name: "anthropic_api", occurred_at: 60.days.ago,
                           metadata: {})

        job.perform

        expect(AuditLog.find_by(tool_event_id: old_event.id)).to be_nil
      end
    end

    context "idempotency" do
      it "does not create duplicate audit_logs on repeated runs" do
        create(:tool_event, organization: organization, user: user,
               tool_name: "claude_code", occurred_at: 1.hour.ago,
               metadata: { "risk_level" => "medium" })

        job.perform
        count_after_first = AuditLog.count

        job.perform
        expect(AuditLog.count).to eq(count_after_first)
      end
    end

    context "events already classified (have audit_log)" do
      it "skips events that already have an audit_log" do
        event = create(:tool_event, organization: organization, user: user,
                       tool_name: "cursor", occurred_at: 1.hour.ago,
                       metadata: { "risk_level" => "high" })
        existing_audit = create(:audit_log, organization: organization,
                                tool_event: event, risk_level: "critical")

        job.perform

        expect(AuditLog.where(tool_event_id: event.id).count).to eq(1)
        expect(AuditLog.find_by(tool_event_id: event.id).id).to eq(existing_audit.id)
      end
    end
  end
end

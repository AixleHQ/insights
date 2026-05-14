require "rails_helper"

RSpec.describe DataRetentionPurgeJob, type: :job do
  describe "#perform" do
    let(:organization) { create(:organization) }
    let(:user) { create(:user) }

    before do
      create(:organization_membership, user: user, organization: organization)
      ToolEvent.delete_all
      ConnectorEventDedup.delete_all
      AuditLog.where.not(tool_event_id: nil).update_all(tool_event_id: nil)
    end

    def create_tool_event(org, usr, occurred_at, project: nil)
      ToolEvent.create!(
        organization: org,
        user: usr,
        project: project,
        tool_name: "claude_code",
        event_type: "chat",
        occurred_at: occurred_at,
        tokens_in: 100,
        tokens_out: 200,
        tokens_total: 300,
        cost_usd: 0.01
      )
    end

    context "when event is outside org retention window" do
      before { organization.retention_policy.update!(tool_events_retention: "30_days") }

      it "deletes the expired event" do
        create_tool_event(organization, user, 45.days.ago)

        result = described_class.new.perform

        expect(ToolEvent.count).to eq(0)
        expect(result[:total_deleted]).to eq(1)
      end
    end

    context "when event is inside org retention window" do
      before { organization.retention_policy.update!(tool_events_retention: "90_days") }

      it "does not delete the event" do
        create_tool_event(organization, user, 30.days.ago)

        result = described_class.new.perform

        expect(ToolEvent.count).to eq(1)
        expect(result[:total_deleted]).to eq(0)
      end
    end

    context "when project has a stricter retention window than org" do
      let(:project) { create(:project, organization: organization) }

      before do
        organization.retention_policy.update!(tool_events_retention: "180_days")
        project.retention_policy.update!(tool_events_retention: "30_days")
      end

      it "applies the project cutoff and deletes the event" do
        create_tool_event(organization, user, 60.days.ago, project: project)

        result = described_class.new.perform

        expect(ToolEvent.where(project: project).count).to eq(0)
        expect(result[:total_deleted]).to eq(1)
      end
    end

    context "when project has a less strict retention window than org" do
      let(:project) { create(:project, organization: organization) }

      before do
        organization.retention_policy.update!(tool_events_retention: "30_days")
        project.retention_policy.update!(tool_events_retention: "180_days")
      end

      it "applies the org cutoff and deletes the event" do
        create_tool_event(organization, user, 60.days.ago, project: project)

        result = described_class.new.perform

        expect(ToolEvent.where(project: project).count).to eq(0)
        expect(result[:total_deleted]).to eq(1)
      end

      it "keeps an event inside the org cutoff even if project window would allow deletion" do
        create_tool_event(organization, user, 10.days.ago, project: project)

        result = described_class.new.perform

        expect(ToolEvent.where(project: project).count).to eq(1)
        expect(result[:total_deleted]).to eq(0)
      end
    end

    context "when audit_logs reference the deleted events" do
      before { organization.retention_policy.update!(tool_events_retention: "30_days") }

      it "nullifies tool_event_id on related audit_logs" do
        event = create_tool_event(organization, user, 60.days.ago)
        audit_log = create(:audit_log, organization: organization, tool_event_id: event.id)

        described_class.new.perform

        expect(ToolEvent.exists?(event.id)).to be false
        expect(audit_log.reload.tool_event_id).to be_nil
      end
    end

    context "when connector_event_dedup rows reference the deleted events" do
      before { organization.retention_policy.update!(tool_events_retention: "30_days") }

      it "deletes the connector_event_dedup rows" do
        event = create_tool_event(organization, user, 60.days.ago)
        ConnectorEventDedup.create!(
          organization_id: organization.id,
          tool_name: "claude_code",
          event_type: "chat",
          unique_key: "ext_id",
          unique_value: SecureRandom.uuid,
          tool_event_id: event.id
        )

        described_class.new.perform

        expect(ToolEvent.exists?(event.id)).to be false
        expect(ConnectorEventDedup.count).to eq(0)
      end
    end

    context "idempotency" do
      before { organization.retention_policy.update!(tool_events_retention: "30_days") }

      it "is safe to re-run — second run deletes nothing and raises no errors" do
        create_tool_event(organization, user, 60.days.ago)

        first_result = described_class.new.perform
        expect(first_result[:total_deleted]).to eq(1)

        second_result = described_class.new.perform
        expect(second_result[:total_deleted]).to eq(0)
        expect(second_result[:errors]).to be_empty
      end
    end

    context "when an error occurs for one org" do
      let(:other_org) { create(:organization) }
      let(:other_user) { create(:user) }

      before do
        create(:organization_membership, user: other_user, organization: other_org)
        organization.retention_policy.update!(tool_events_retention: "30_days")
        other_org.retention_policy.update!(tool_events_retention: "30_days")
      end

      it "logs the error and continues processing other organizations" do
        allow(RetentionService).to receive(:retention_cutoff).and_call_original
        allow(RetentionService)
          .to receive(:retention_cutoff)
          .with(organization, :tool_events_retention)
          .and_raise(StandardError, "Test error")

        result = described_class.new.perform

        expect(result[:errors].size).to eq(1)
        expect(result[:errors].first[:organization_id]).to eq(organization.id)
        expect(result[:organizations_processed]).to eq(1)
      end
    end

    context "retention purge log creation" do
      before { organization.retention_policy.update!(tool_events_retention: "30_days") }

      it "creates an org-level purge log after a successful run" do
        create_tool_event(organization, user, 60.days.ago)

        expect { described_class.new.perform }.to change(RetentionPurgeLog, :count).by_at_least(1)

        org_log = RetentionPurgeLog.where(organization: organization, project: nil).last
        expect(org_log).to be_present
        expect(org_log.status).to eq("success")
        expect(org_log.retention_policy_type).to eq("org")
        expect(org_log.records_deleted).to eq(1)
        expect(org_log.retention_days_applied).to be_within(2).of(30)
        expect(org_log.cutoff_timestamp).to be_within(5.minutes).of(30.days.ago)
      end

      it "creates a project-level purge log for each project" do
        project = create(:project, organization: organization)
        project.retention_policy.update!(tool_events_retention: "30_days")
        create_tool_event(organization, user, 60.days.ago, project: project)

        described_class.new.perform

        project_log = RetentionPurgeLog.where(organization: organization, project: project).last
        expect(project_log).to be_present
        expect(project_log.retention_policy_type).to eq("project")
        expect(project_log.status).to eq("success")
      end

      it "creates a failed log when an error occurs" do
        allow(RetentionService).to receive(:retention_cutoff)
          .with(organization, :tool_events_retention)
          .and_raise(StandardError, "Simulated failure")

        described_class.new.perform

        failed_log = RetentionPurgeLog.where(organization: organization, status: :failed).last
        expect(failed_log).to be_present
        expect(failed_log.error_message).to eq("Simulated failure")
        expect(failed_log.records_deleted).to eq(0)
      end
    end

    context "Sidekiq configuration" do
      it "uses the maintenance queue" do
        expect(described_class.sidekiq_options["queue"]).to eq("maintenance")
      end

      it "has retry set to 3" do
        expect(described_class.sidekiq_options["retry"]).to eq(3)
      end
    end
  end
end

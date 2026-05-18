require "rails_helper"

RSpec.describe OrgRetentionCleanupJob, type: :job do
  describe "#perform" do
    let(:organization) { create(:organization) }
    let(:user) { create(:user) }
    let(:organization_connector) { create(:organization_connector, organization: organization) }

    before do
      WebhookDelivery.delete_all
      ConnectorHealthSnapshot.delete_all
      create(:organization_membership, user: user, organization: organization)
      Organization.where.not(id: organization.id).destroy_all
    end

    context "with webhook deliveries" do
      it "deletes deliveries older than the retention window" do
        old = create(:webhook_delivery, organization_connector: organization_connector,
          created_at: 40.days.ago, updated_at: 40.days.ago)
        recent = create(:webhook_delivery, organization_connector: organization_connector,
          created_at: 1.day.ago, updated_at: 1.day.ago)

        result = described_class.new.perform

        expect(WebhookDelivery.exists?(old.id)).to be false
        expect(WebhookDelivery.exists?(recent.id)).to be true
        expect(result[:total_deleted]).to eq(1)
      end

      it "deletes old webhook deliveries for every organization in one run" do
        other_org = create(:organization)
        other_connector = create(:organization_connector, organization: other_org, connector_type: "gitlab")
        create(:webhook_delivery, organization_connector: organization_connector,
          created_at: 40.days.ago, updated_at: 40.days.ago)
        create(:webhook_delivery, organization_connector: other_connector,
          created_at: 40.days.ago, updated_at: 40.days.ago)

        result = described_class.new.perform

        expect(WebhookDelivery.count).to eq(0)
        expect(result[:total_deleted]).to eq(2)
      end
    end

    context "with connector health snapshots" do
      it "deletes snapshots older than the retention window" do
        old = create(:connector_health_snapshot, :old, organization_connector: organization_connector)
        recent = create(:connector_health_snapshot, organization_connector: organization_connector,
          snapshotted_at: 10.days.ago)

        result = described_class.new.perform

        expect(ConnectorHealthSnapshot.exists?(old.id)).to be false
        expect(ConnectorHealthSnapshot.exists?(recent.id)).to be true
        expect(result[:total_deleted]).to eq(1)
      end
    end

    context "with multiple organizations" do
      let(:org2) { create(:organization) }
      let(:user2) { create(:user) }
      let(:connector2) { create(:organization_connector, organization: org2, connector_type: "gitlab") }

      before do
        create(:organization_membership, user: user2, organization: org2)
      end

      it "processes all organizations" do
        create(:webhook_delivery, organization_connector: organization_connector,
          created_at: 40.days.ago, updated_at: 40.days.ago)
        create(:webhook_delivery, organization_connector: connector2,
          created_at: 40.days.ago, updated_at: 40.days.ago)

        result = described_class.new.perform

        expect(result[:organizations_processed]).to eq(2)
        expect(result[:total_deleted]).to eq(2)
        expect(WebhookDelivery.count).to eq(0)
      end
    end

    context "when an error occurs" do
      it "logs the error and continues processing other organizations" do
        org2 = create(:organization)
        create(:organization_membership, user: user, organization: org2)
        create(:organization_connector, organization: org2, connector_type: "gitlab")

        job = described_class.new
        allow(job).to receive(:cleanup_organization).and_wrap_original do |original, org|
          raise StandardError, "Test error" if org.id == organization.id
          original.call(org)
        end

        result = job.perform

        expect(result[:organizations_processed]).to eq(1)
        expect(result[:errors].size).to eq(1)
        expect(result[:errors].first[:error]).to eq("Test error")
      end
    end

    context "with Sidekiq configuration" do
      it "uses the maintenance queue" do
        expect(described_class.sidekiq_options["queue"]).to eq("maintenance")
      end

      it "has retry enabled" do
        expect(described_class.sidekiq_options["retry"]).to eq(3)
      end
    end
  end
end

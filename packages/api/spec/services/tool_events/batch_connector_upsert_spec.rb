# frozen_string_literal: true

require "rails_helper"

RSpec.describe ToolEvents::BatchConnectorUpsert do
  let(:organization) { create(:organization) }
  let(:project) { create(:project, organization: organization) }
  let(:connector) { create(:organization_connector, organization: organization, connector_type: "linear") }

  def build_record(external_id, title = "Issue #{external_id}", updated_at = "2026-04-01T00:00:00Z", user_id: nil, project_id: nil)
    {
      unique_value:    external_id,
      organization_id: organization.id,
      tool_name:       "linear",
      event_type:      "issue",
      occurred_at:     Time.zone.parse(updated_at),
      user_id:         user_id,
      project_id:      project_id,
      metadata: {
        issue_snapshot_id: external_id,
        title:             title,
        action:            "synced"
      }
    }
  end

  describe ".call" do
    it "returns immediately when records is empty" do
      expect {
        described_class.call(unique_key: "issue_snapshot_id", records: [])
      }.not_to change(ToolEvent, :count)
    end

    it "inserts new ToolEvents and dedup rows for a batch" do
      records = [ build_record("issue-1"), build_record("issue-2"), build_record("issue-3") ]

      expect {
        described_class.call(unique_key: "issue_snapshot_id", records:)
      }.to change(ToolEvent, :count).by(3)
        .and change(ConnectorEventDedup, :count).by(3)
    end

    it "does not duplicate rows on a second call with the same batch" do
      records = [ build_record("issue-1"), build_record("issue-2") ]

      described_class.call(unique_key: "issue_snapshot_id", records:)

      expect {
        described_class.call(unique_key: "issue_snapshot_id", records:)
      }.not_to change(ToolEvent, :count)
    end

    it "updates mutable metadata on existing events" do
      described_class.call(unique_key: "issue_snapshot_id", records: [ build_record("issue-1", "Old Title") ])

      described_class.call(unique_key: "issue_snapshot_id", records: [ build_record("issue-1", "New Title") ])

      event = ToolEvent
        .where(organization_id: organization.id, tool_name: "linear")
        .where("metadata ->> 'issue_snapshot_id' = ?", "issue-1")
        .first

      expect(event.metadata["title"]).to eq("New Title")
      expect(ToolEvent.where(organization_id: organization.id, tool_name: "linear").count).to eq(1)
    end

    it "handles mixed batches (some new, some existing)" do
      described_class.call(unique_key: "issue_snapshot_id", records: [ build_record("issue-1") ])

      expect {
        described_class.call(
          unique_key: "issue_snapshot_id",
          records: [ build_record("issue-1", "Updated"), build_record("issue-2") ]
        )
      }.to change(ToolEvent, :count).by(1)

      expect(ToolEvent.where(organization_id: organization.id, tool_name: "linear").count).to eq(2)
    end

    describe "auto project membership" do
      let(:user) { create(:user) }

      before { create(:organization_membership, user: user, organization: organization) }

      it "creates a viewer membership for contributing users on insert" do
        records = [ build_record("issue-1", user_id: user.id, project_id: project.id) ]

        expect {
          described_class.call(unique_key: "issue_snapshot_id", records:)
        }.to change(ProjectMembership, :count).by(1)

        expect(ProjectMembership.find_by(user: user, project: project).role).to eq("viewer")
      end

      it "creates one membership per unique user/project pair in the batch" do
        records = [
          build_record("issue-1", user_id: user.id, project_id: project.id),
          build_record("issue-2", user_id: user.id, project_id: project.id)
        ]

        expect {
          described_class.call(unique_key: "issue_snapshot_id", records:)
        }.to change(ProjectMembership, :count).by(1)
      end

      it "creates a membership when an existing event is updated" do
        described_class.call(unique_key: "issue_snapshot_id", records: [ build_record("issue-1") ])
        records = [ build_record("issue-1", "Updated", user_id: user.id, project_id: project.id) ]

        expect {
          described_class.call(unique_key: "issue_snapshot_id", records:)
        }.to change(ProjectMembership, :count).by(1)
      end

      it "skips records without a user_id or project_id" do
        records = [
          build_record("issue-1", project_id: project.id),
          build_record("issue-2", user_id: user.id)
        ]

        expect {
          described_class.call(unique_key: "issue_snapshot_id", records:)
        }.not_to change(ProjectMembership, :count)
      end

      it "does not downgrade an existing membership role" do
        create(:project_membership, user: user, project: project, role: "member")
        records = [ build_record("issue-1", user_id: user.id, project_id: project.id) ]

        described_class.call(unique_key: "issue_snapshot_id", records:)

        expect(ProjectMembership.find_by(user: user, project: project).role).to eq("member")
      end
    end
  end
end

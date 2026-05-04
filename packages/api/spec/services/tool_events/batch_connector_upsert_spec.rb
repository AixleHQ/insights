# frozen_string_literal: true

require "rails_helper"

RSpec.describe ToolEvents::BatchConnectorUpsert do
  let(:organization) { create(:organization) }
  let(:project) { create(:project, organization: organization) }
  let(:connector) { create(:organization_connector, organization: organization, connector_type: "linear") }

  def build_record(external_id, title = "Issue #{external_id}", updated_at = "2026-04-01T00:00:00Z")
    {
      unique_value:    external_id,
      organization_id: organization.id,
      tool_name:       "linear",
      event_type:      "issue",
      occurred_at:     Time.zone.parse(updated_at),
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
  end
end

# frozen_string_literal: true

require "rails_helper"

RSpec.describe ToolEvents::ConnectorUpsert do
  describe ".call" do
    let(:organization) { create(:organization) }
    let(:project) { create(:project, organization: organization) }
    let(:connector) { create(:organization_connector, organization: organization, connector_type: "gitlab") }
    let(:repository) { create(:repository, organization_connector: connector, project: project) }

    let(:base_attributes) do
      {
        organization_id: organization.id,
        repository_id: repository.id,
        project_id: project.id,
        tool_name: "gitlab",
        event_type: "commit",
        occurred_at: Time.zone.parse("2025-03-01 12:00:00"),
        user_id: nil,
        metadata: {
          sha: "abc123",
          message: "first"
        }
      }
    end

    it "creates then updates without duplicating rows" do
      expect {
        described_class.call(unique_key: :sha, unique_value: "abc123", **base_attributes)
      }.to change(ToolEvent, :count).by(1)

      described_class.call(
        unique_key: :sha,
        unique_value: "abc123",
        **base_attributes.merge(
          occurred_at: Time.zone.parse("2025-03-02 12:00:00"),
          metadata: {
            sha: "abc123",
            message: "updated"
          }
        )
      )

      expect(ToolEvent.where(tool_name: "gitlab", event_type: "commit").count).to eq(1)
      row = ToolEvent.where("metadata ->> 'sha' = ?", "abc123").first
      expect(row.metadata["message"]).to eq("updated")
    end
  end

  describe "concurrent upserts for the same dedupe key", use_transactional_tests: false do
    let(:organization) { create(:organization) }
    let(:project) { create(:project, organization: organization) }
    let(:connector) { create(:organization_connector, organization: organization, connector_type: "gitlab") }
    let(:repository) { create(:repository, organization_connector: connector, project: project) }

    let(:base_attributes) do
      {
        organization_id: organization.id,
        repository_id: repository.id,
        project_id: project.id,
        tool_name: "gitlab",
        event_type: "commit",
        occurred_at: Time.zone.parse("2025-03-01 12:00:00"),
        user_id: nil,
        metadata: {
          sha: "race-sha",
          message: "first"
        }
      }
    end

    after do
      ToolEvent.where(organization_id: organization.id).delete_all
      organization.reload.destroy!
    end

    it "creates exactly one row when many threads upsert together" do
      thread_count = 12
      mutex = Mutex.new
      arrived = 0
      cv = ConditionVariable.new

      threads = Array.new(thread_count) do
        Thread.new do
          ActiveRecord::Base.connection_pool.with_connection do
            mutex.synchronize do
              arrived += 1
              cv.broadcast
              cv.wait(mutex) until arrived == thread_count
            end

            described_class.call(unique_key: :sha, unique_value: "race-sha", **base_attributes)
          end
        end
      end

      threads.each(&:join)

      expect(
        ToolEvent.where(
          organization_id: organization.id,
          repository_id: repository.id,
          tool_name: "gitlab",
          event_type: "commit"
        ).where("metadata ->> 'sha' = ?", "race-sha").count
      ).to eq(1)
    end
  end
end

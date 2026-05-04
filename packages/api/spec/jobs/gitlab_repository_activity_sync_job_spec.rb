# frozen_string_literal: true

require "rails_helper"

RSpec.describe GitlabRepositoryActivitySyncJob, type: :job do
  let(:organization) { create(:organization) }
  let(:user) { create(:user, email: "dev@example.com") }
  let!(:membership) { create(:organization_membership, user: user, organization: organization) }
  let(:connector) do
    create(:organization_connector,
      organization: organization,
      connector_type: "gitlab",
      pending_activity_jobs: 1)
  end
  let(:project) { create(:project, organization: organization) }
  let!(:repository) do
    create(:repository,
      organization_connector: connector,
      project: project,
      external_id: "42",
      default_branch: "main")
  end

  let(:synced_at) { 2.days.ago.iso8601 }

  before do
    allow_any_instance_of(Oauth::GitlabProvider).to receive(:fetch_commits).and_return([
      {
        "id" => "abc123",
        "message" => "Fix bug",
        "timestamp" => synced_at,
        "url" => "https://gitlab.com/group/repo/-/commit/abc123",
        "author" => { "name" => "Dev User", "email" => "dev@example.com" }
      }
    ])
    allow_any_instance_of(Oauth::GitlabProvider).to receive(:fetch_merge_requests).and_return([
      {
        iid: 7,
        title: "Improve analytics",
        state: "merged",
        updated_at: synced_at,
        web_url: "https://gitlab.com/group/repo/-/merge_requests/7",
        author_username: "devuser"
      }
    ])
    allow_any_instance_of(Oauth::GitlabProvider).to receive(:fetch_pipelines).and_return([
      {
        id: 99,
        status: "success",
        ref: "main",
        updated_at: synced_at,
        web_url: "https://gitlab.com/group/repo/-/pipelines/99",
        sha: "abc123"
      }
    ])
  end

  describe "#perform" do
    it "creates commit, MR, and pipeline tool events" do
      expect {
        described_class.new.perform(connector.id, repository.id)
      }.to change(ToolEvent, :count).by(3)

      expect(ToolEvent.where(tool_name: "gitlab", event_type: "commit").count).to eq(1)
      expect(ToolEvent.where(tool_name: "gitlab", event_type: "review").count).to eq(1)
      expect(ToolEvent.where(tool_name: "gitlab", event_type: "other").count).to eq(1)
    end

    it "marks the repository as synced" do
      described_class.new.perform(connector.id, repository.id)
      expect(repository.reload.last_sync_at).to be_present
    end

    it "uses three separate GitlabProvider instances (parallel fetch)" do
      instance_count = 0
      allow(Oauth::GitlabProvider).to receive(:new).and_wrap_original do |original, *args|
        instance_count += 1
        original.call(*args)
      end

      described_class.new.perform(connector.id, repository.id)

      expect(instance_count).to eq(3)
    end

    context "when it is the last pending job (counter = 1)" do
      it "calls mark_synced! on the connector" do
        connector.update_column(:pending_activity_jobs, 1)
        described_class.new.perform(connector.id, repository.id)
        expect(connector.reload.pending_activity_jobs).to eq(0)
        # mark_synced! sets status to "connected" and updates last_sync_at
        expect(connector.reload.status).to eq("connected")
      end
    end

    context "when there are still other pending jobs (counter > 1)" do
      it "decrements the counter without calling mark_synced!" do
        connector.update_column(:pending_activity_jobs, 3)
        described_class.new.perform(connector.id, repository.id)
        expect(connector.reload.pending_activity_jobs).to eq(2)
        expect(connector.reload.last_sync_at).to be_nil
      end
    end
  end
end

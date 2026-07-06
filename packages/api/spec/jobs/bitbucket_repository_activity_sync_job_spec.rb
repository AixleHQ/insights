# frozen_string_literal: true

require "rails_helper"

RSpec.describe BitbucketRepositoryActivitySyncJob, type: :job do
  let(:organization) { create(:organization) }
  let(:user) { create(:user, email: "dev@example.com") }
  let!(:membership) { create(:organization_membership, user: user, organization: organization) }
  let(:connector) do
    create(:organization_connector,
      organization: organization,
      connector_type: "bitbucket",
      pending_activity_jobs: 1)
  end
  let(:project) { create(:project, organization: organization) }
  let!(:repository) do
    create(:repository,
      organization_connector: connector,
      project: project,
      external_id: "{repo-uuid}",
      full_name: "workspace/repo",
      default_branch: "main")
  end

  let(:synced_at) { 2.days.ago.iso8601 }

  before do
    allow_any_instance_of(Oauth::BitbucketProvider).to receive(:ensure_fresh_token!)

    allow_any_instance_of(Oauth::BitbucketProvider).to receive(:fetch_commits).and_return([
      {
        "id" => "abc123",
        "message" => "Fix bug",
        "timestamp" => synced_at,
        "url" => "https://bitbucket.org/workspace/repo/commits/abc123",
        "author" => { "name" => "Dev User", "email" => "dev@example.com" }
      }
    ])
    allow_any_instance_of(Oauth::BitbucketProvider).to receive(:fetch_pull_requests).and_return([
      {
        id: 7,
        title: "Improve analytics",
        state: "MERGED",
        updated_at: synced_at,
        web_url: "https://bitbucket.org/workspace/repo/pull-requests/7",
        author_username: "devuser"
      }
    ])
    allow_any_instance_of(Oauth::BitbucketProvider).to receive(:fetch_pipelines).and_return([
      {
        id: "{pipeline-uuid}",
        status: "COMPLETED",
        ref: "main",
        updated_at: synced_at,
        web_url: "https://bitbucket.org/workspace/repo/pipelines/results/12",
        sha: "abc123"
      }
    ])
  end

  describe "#perform" do
    it "creates commit, PR, and pipeline tool events" do
      expect {
        described_class.new.perform(connector.id, repository.id)
      }.to change(ToolEvent, :count).by(3)

      expect(ToolEvent.where(tool_name: "bitbucket", event_type: "commit").count).to eq(1)
      expect(ToolEvent.where(tool_name: "bitbucket", event_type: "review").count).to eq(1)
      expect(ToolEvent.where(tool_name: "bitbucket", event_type: "other").count).to eq(1)
    end

    it "marks the repository as synced" do
      described_class.new.perform(connector.id, repository.id)
      expect(repository.reload.last_sync_at).to be_present
    end

    it "uses three separate BitbucketProvider instances (parallel fetch)" do
      instance_count = 0
      allow(Oauth::BitbucketProvider).to receive(:new).and_wrap_original do |original, *args|
        instance_count += 1
        original.call(*args)
      end

      described_class.new.perform(connector.id, repository.id)

      # prewarm + 3 parallel instances = 4 total
      expect(instance_count).to eq(4)
    end

    context "when it is the last pending job (counter = 1)" do
      it "calls mark_synced! on the connector" do
        connector.update_column(:pending_activity_jobs, 1)
        described_class.new.perform(connector.id, repository.id)
        expect(connector.reload.pending_activity_jobs).to eq(0)
        expect(connector.reload.status).to eq("connected")
      end

      it "records a success health snapshot using activity_sync_started_at" do
        connector.update_column(:activity_sync_started_at, 5.minutes.ago)
        connector.update_column(:pending_activity_jobs, 1)

        expect {
          described_class.new.perform(connector.id, repository.id)
        }.to change(ConnectorHealthSnapshot, :count).by(1)

        snapshot = ConnectorHealthSnapshot.last
        expect(snapshot.status).to eq("success")
        expect(snapshot.sync_duration_ms).to be > 0
      end
    end

    context "when there are still other pending jobs (counter > 1)" do
      it "decrements the counter without calling mark_synced!" do
        connector.update_column(:pending_activity_jobs, 3)
        described_class.new.perform(connector.id, repository.id)
        expect(connector.reload.pending_activity_jobs).to eq(2)
        expect(connector.reload.last_sync_at).to be_nil
      end

      it "does not record a health snapshot" do
        connector.update_column(:pending_activity_jobs, 3)

        expect {
          described_class.new.perform(connector.id, repository.id)
        }.not_to change(ConnectorHealthSnapshot, :count)
      end
    end

    context "when sync_pull_requests is disabled" do
      before { connector.update_column(:config, { "sync_pull_requests" => false }) }

      it "skips PR ingestion but still creates commit and pipeline events" do
        expect {
          described_class.new.perform(connector.id, repository.id)
        }.to change(ToolEvent, :count).by(2)

        expect(ToolEvent.where(tool_name: "bitbucket", event_type: "review").count).to eq(0)
        expect(ToolEvent.where(tool_name: "bitbucket", event_type: "commit").count).to eq(1)
        expect(ToolEvent.where(tool_name: "bitbucket", event_type: "other").count).to eq(1)
      end
    end

    context "when repository full_name is invalid" do
      before { repository.update_column(:full_name, "invalid-no-slash") }

      it "skips the repository and still decrements the counter" do
        connector.update_column(:pending_activity_jobs, 1)

        expect {
          described_class.new.perform(connector.id, repository.id)
        }.not_to change(ToolEvent, :count)

        expect(connector.reload.pending_activity_jobs).to eq(0)
      end
    end
  end
end

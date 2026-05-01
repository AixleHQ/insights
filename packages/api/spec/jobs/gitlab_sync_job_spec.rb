# frozen_string_literal: true

require "rails_helper"

RSpec.describe GitlabSyncJob, type: :job do
  let(:organization) { create(:organization) }
  let(:user) { create(:user, email: "dev@example.com") }
  let!(:membership) { create(:organization_membership, user: user, organization: organization) }
  let(:connector) { create(:organization_connector, organization: organization, connector_type: "gitlab") }
  let(:project) { create(:project, organization: organization) }
  let!(:repository) { create(:repository, organization_connector: connector, project: project, external_id: "42") }

  let(:synced_at) { 2.days.ago.iso8601 }

  let(:stub_commits) do
    [
      {
        "id" => "abc123",
        "message" => "Fix bug",
        "timestamp" => synced_at,
        "url" => "https://gitlab.com/group/repo/-/commit/abc123",
        "author" => { "name" => "Dev User", "email" => "dev@example.com" }
      }
    ]
  end

  let(:stub_mrs) do
    [
      {
        iid: 7,
        title: "Improve analytics",
        state: "merged",
        updated_at: synced_at,
        web_url: "https://gitlab.com/group/repo/-/merge_requests/7",
        author_username: "devuser"
      }
    ]
  end

  let(:stub_pipelines) do
    [
      {
        id: 99,
        status: "success",
        ref: "main",
        updated_at: synced_at,
        web_url: "https://gitlab.com/group/repo/-/pipelines/99",
        sha: "abc123"
      }
    ]
  end

  # Stubs the fetch_repositories call on the provider returned by BaseProvider.for
  # and stubs the three per-repo fetch calls on any GitlabProvider instance
  # (each parallel future creates its own instance).
  def stub_gitlab_provider
    base_provider = instance_double(Oauth::GitlabProvider)
    allow(Oauth::BaseProvider).to receive(:for).with(connector).and_return(base_provider)
    allow(base_provider).to receive(:fetch_repositories).with(all_pages: true).and_return([
      {
        external_id: "42",
        name: "repo",
        full_name: "group/repo",
        html_url: "https://gitlab.com/group/repo",
        default_branch: "main",
        is_private: true,
        description: "GitLab repo"
      }
    ])

    allow_any_instance_of(Oauth::GitlabProvider).to receive(:fetch_commits).and_return(stub_commits)
    allow_any_instance_of(Oauth::GitlabProvider).to receive(:fetch_merge_requests).and_return(stub_mrs)
    allow_any_instance_of(Oauth::GitlabProvider).to receive(:fetch_pipelines).and_return(stub_pipelines)
  end

  describe "#perform — sync action" do
    before { stub_gitlab_provider }

    it "backfills commits, merge requests, and pipelines for linked repositories" do
      expect {
        described_class.new.perform(connector.id, "sync")
      }.to change(ToolEvent, :count).by(3)

      expect(ToolEvent.where(tool_name: "gitlab", event_type: "commit").count).to eq(1)
      expect(ToolEvent.where(tool_name: "gitlab", event_type: "review").count).to eq(1)
      expect(ToolEvent.where(tool_name: "gitlab", event_type: "other").count).to eq(1)
    end

    it "deduplicates sync results across repeated runs" do
      described_class.new.perform(connector.id, "sync")

      expect {
        described_class.new.perform(connector.id, "sync")
      }.not_to change(ToolEvent, :count)
    end

    it "fetches commits, MRs, and pipelines in parallel (three providers instantiated)" do
      instance_count = 0
      allow(Oauth::GitlabProvider).to receive(:new).and_wrap_original do |original, *args|
        instance_count += 1
        original.call(*args)
      end
      allow_any_instance_of(Oauth::GitlabProvider).to receive(:fetch_commits).and_return(stub_commits)
      allow_any_instance_of(Oauth::GitlabProvider).to receive(:fetch_merge_requests).and_return(stub_mrs)
      allow_any_instance_of(Oauth::GitlabProvider).to receive(:fetch_pipelines).and_return(stub_pipelines)

      described_class.new.perform(connector.id, "sync")

      expect(instance_count).to eq(3)
    end
  end

  describe "#perform — fan-out mode (GITLAB_FANOUT=true)" do
    before do
      stub_gitlab_provider
      allow(ENV).to receive(:[]).and_call_original
      allow(ENV).to receive(:[]).with("GITLAB_FANOUT").and_return("true")
    end

    it "enqueues one GitlabRepositoryActivitySyncJob per repository" do
      expect {
        described_class.new.perform(connector.id, "sync")
      }.to have_enqueued_job(GitlabRepositoryActivitySyncJob)
        .with(connector.id, repository.id)
    end

    it "sets pending_activity_jobs counter on the connector" do
      described_class.new.perform(connector.id, "sync")
      expect(connector.reload.pending_activity_jobs).to eq(1)
    end

    it "does not call mark_synced! immediately (deferred to child jobs)" do
      allow(connector).to receive(:mark_synced!).and_call_original
      described_class.new.perform(connector.id, "sync")
      expect(connector).not_to have_received(:mark_synced!)
    end
  end

  describe "#perform — webhook push action" do
    let(:push_payload) do
      {
        "project_id" => 42,
        "commits" => [
          {
            "id" => "abc123",
            "message" => "Fix bug",
            "timestamp" => Time.current.iso8601,
            "url" => "https://gitlab.com/group/repo/-/commit/abc123",
            "author" => { "name" => "Dev User", "email" => "dev@example.com" }
          }
        ]
      }
    end

    it "sets user_id on commit event when author email matches an org member" do
      expect {
        described_class.new.perform(connector.id, "webhook", {
          "event_type" => "Push Hook",
          "payload" => push_payload
        })
      }.to change(ToolEvent, :count).by(1)

      event = ToolEvent.where(tool_name: "gitlab", event_type: "commit")
        .where("metadata ->> 'sha' = ?", "abc123")
        .first
      expect(event.user_id).to eq(user.id)
      expect(event.tool_name).to eq("gitlab")
    end
  end
end

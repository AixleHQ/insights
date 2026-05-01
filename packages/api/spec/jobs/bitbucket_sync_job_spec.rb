require "rails_helper"

RSpec.describe BitbucketSyncJob, type: :job do
  let(:organization) { create(:organization) }
  let(:user) { create(:user, email: "dev@example.com") }
  let!(:membership) { create(:organization_membership, user: user, organization: organization) }
  let(:connector) { create(:organization_connector, organization: organization, connector_type: "bitbucket") }
  let(:project) { create(:project, organization: organization) }
  let!(:repository) do
    create(
      :repository,
      organization_connector: connector,
      project: project,
      external_id: "{repo-uuid}",
      full_name: "workspace/repo"
    )
  end

  describe "#perform — sync action" do
    let(:provider) { instance_double(Oauth::BitbucketProvider) }
    let(:synced_at) { 2.days.ago.iso8601 }

    before do
      allow(Oauth::BaseProvider).to receive(:for).with(connector).and_return(provider)
      allow(provider).to receive(:fetch_repositories).with(all_pages: true).and_return([
        {
          external_id: "{repo-uuid}",
          name: "repo",
          full_name: "workspace/repo",
          html_url: "https://bitbucket.org/workspace/repo",
          clone_url: "https://bbuser@bitbucket.org/workspace/repo.git",
          default_branch: "main",
          is_private: true,
          description: "Bitbucket repo"
        }
      ])
      allow(provider).to receive(:ensure_fresh_token!)
      allow_any_instance_of(Oauth::BitbucketProvider).to receive(:fetch_commits).and_return([
        {
          "id" => "abc123",
          "message" => "Fix bug",
          "timestamp" => synced_at,
          "url" => "https://bitbucket.org/workspace/repo/commits/abc123",
          "author" => {
            "name" => "Dev User",
            "email" => "dev@example.com"
          }
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

    it "backfills commits, pull requests, and pipelines for linked repositories" do
      expect {
        described_class.new.perform(connector.id, "sync")
      }.to change(ToolEvent, :count).by(3)

      expect(ToolEvent.where(tool_name: "bitbucket", event_type: "commit").count).to eq(1)
      expect(ToolEvent.where(tool_name: "bitbucket", event_type: "review").count).to eq(1)
      expect(ToolEvent.where(tool_name: "bitbucket", event_type: "other").count).to eq(1)
    end

    it "deduplicates sync results across repeated runs" do
      described_class.new.perform(connector.id, "sync")

      expect {
        described_class.new.perform(connector.id, "sync")
      }.not_to change(ToolEvent, :count)
    end

    context "when BITBUCKET_FANOUT is enabled" do
      before { stub_const("ENV", ENV.to_hash.merge("BITBUCKET_FANOUT" => "true")) }

      it "enqueues one BitbucketRepositoryActivitySyncJob per repository" do
        expect {
          described_class.new.perform(connector.id, "sync")
        }.to have_enqueued_job(BitbucketRepositoryActivitySyncJob).with(connector.id, repository.id)
      end

      it "sets pending_activity_jobs counter on the connector" do
        described_class.new.perform(connector.id, "sync")
        expect(connector.reload.pending_activity_jobs).to eq(1)
      end

      it "does not call mark_synced! directly (deferred to child job)" do
        expect_any_instance_of(OrganizationConnector).not_to receive(:mark_synced!)
        described_class.new.perform(connector.id, "sync")
      end

      it "does not create tool events directly (delegated to child jobs)" do
        expect {
          described_class.new.perform(connector.id, "sync")
        }.not_to change(ToolEvent, :count)
      end
    end
  end

  describe "#perform — webhook push action" do
    let(:push_payload) do
      {
        "repository" => { "uuid" => "{repo-uuid}" },
        "push" => {
          "changes" => [
            {
              "commits" => [
                {
                  "hash" => "abc123",
                  "message" => "Fix bug",
                  "date" => Time.current.iso8601,
                  "author" => {
                    "raw" => "Dev User <dev@example.com>",
                    "user" => { "display_name" => "Dev User" }
                  }
                }
              ]
            }
          ]
        }
      }
    end

    it "sets user_id on commit event when author email matches an org member" do
      expect {
        described_class.new.perform(connector.id, "webhook", {
          "event_type" => "repo:push",
          "payload" => push_payload
        })
      }.to change(ToolEvent, :count).by(1)

      event = ToolEvent.where(tool_name: "bitbucket", event_type: "commit")
        .where("metadata ->> 'sha' = ?", "abc123")
        .first
      expect(event.user_id).to eq(user.id)
      expect(event.tool_name).to eq("bitbucket")
    end
  end
end

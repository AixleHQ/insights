# frozen_string_literal: true

require "rails_helper"

RSpec.describe GitlabSyncJob, type: :job do
  let(:organization) { create(:organization) }
  let(:user) { create(:user, email: "dev@example.com") }
  let!(:membership) { create(:organization_membership, user: user, organization: organization) }
  let(:connector) { create(:organization_connector, organization: organization, connector_type: "gitlab") }
  let(:project) { create(:project, organization: organization) }
  let!(:repository) { create(:repository, organization_connector: connector, project: project, external_id: "42") }

  describe "#perform — sync action" do
    let(:provider) { instance_double(Oauth::GitlabProvider) }
    let(:synced_at) { 2.days.ago.iso8601 }

    before do
      allow(Oauth::BaseProvider).to receive(:for).with(connector).and_return(provider)
      allow(provider).to receive(:fetch_repositories).and_return([
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
      allow(provider).to receive(:fetch_commits).and_return([
        {
          "id" => "abc123",
          "message" => "Fix bug",
          "timestamp" => synced_at,
          "url" => "https://gitlab.com/group/repo/-/commit/abc123",
          "author" => {
            "name" => "Dev User",
            "email" => "dev@example.com"
          }
        }
      ])
      allow(provider).to receive(:fetch_merge_requests).and_return([
        {
          iid: 7,
          title: "Improve analytics",
          state: "merged",
          updated_at: synced_at,
          web_url: "https://gitlab.com/group/repo/-/merge_requests/7",
          author_username: "devuser"
        }
      ])
      allow(provider).to receive(:fetch_pipelines).and_return([
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
            "author" => {
              "name" => "Dev User",
              "email" => "dev@example.com"
            }
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

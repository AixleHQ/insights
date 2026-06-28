# frozen_string_literal: true

require "rails_helper"

RSpec.describe GithubSyncJob, type: :job do
  let(:organization) { create(:organization) }
  let(:user) { create(:user, email: "dev@example.com") }
  let!(:membership) { create(:organization_membership, user: user, organization: organization) }
  let(:connector) { create(:organization_connector, organization: organization, connector_type: "github") }
  let(:project) { create(:project, organization: organization) }
  let!(:repository) { create(:repository, organization_connector: connector, project: project, external_id: "42") }

  describe "#perform — sync action" do
    it "calls fetch_repositories (not list_repositories)" do
      provider = instance_double(Oauth::GithubProvider)
      allow(Oauth::BaseProvider).to receive(:for).with(connector).and_return(provider)
      allow(provider).to receive(:fetch_repositories).and_return([])
      allow(provider).to receive(:fetch_commits).and_return([])

      described_class.new.perform(connector.id, "sync")

      expect(provider).to have_received(:fetch_repositories)
    end

    it "backfills recent commits for repositories linked to a project" do
      provider = instance_double(Oauth::GithubProvider)
      allow(Oauth::BaseProvider).to receive(:for).with(connector).and_return(provider)
      allow(provider).to receive(:fetch_repositories).and_return([])
      allow(provider).to receive(:fetch_commits).with(
        repository.full_name,
        branch: repository.default_branch,
        since: anything
      ).and_return([
        {
          "id" => "abc123def",
          "timestamp" => Time.current.iso8601,
          "message" => "Backfill commit",
          "author" => { "name" => "Dev User", "email" => "dev@example.com" },
          "url" => "https://github.com/org/repo/commit/abc123def"
        }
      ])

      expect {
        described_class.new.perform(connector.id, "sync")
      }.to change(ToolEvent, :count).by(1)

      event = ToolEvent.last
      expect(event.metadata["sha"]).to eq("abc123def")
      expect(event.project_id).to eq(project.id)
    end

    it "does not call fetch_commits for repositories not linked to a project" do
      repository.update!(project_id: nil)

      provider = instance_double(Oauth::GithubProvider)
      allow(Oauth::BaseProvider).to receive(:for).with(connector).and_return(provider)
      allow(provider).to receive(:fetch_repositories).and_return([])
      allow(provider).to receive(:fetch_commits)

      described_class.new.perform(connector.id, "sync")

      expect(provider).not_to have_received(:fetch_commits)
    end
  end

  describe "#perform — webhook push action" do
    let(:push_payload) do
      {
        "repository" => { "id" => 42 },
        "commits" => [
          {
            "id" => "abc123",
            "message" => "Fix bug",
            "timestamp" => Time.current.iso8601,
            "url" => "https://github.com/org/repo/commit/abc123",
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
          "event_type" => "push",
          "payload" => push_payload
        })
      }.to change(ToolEvent, :count).by(1)

      event = ToolEvent.last
      expect(event.user_id).to eq(user.id)
    end

    it "sets repository_id directly on commit event" do
      described_class.new.perform(connector.id, "webhook", {
        "event_type" => "push",
        "payload" => push_payload
      })

      event = ToolEvent.last
      expect(event.repository_id).to eq(repository.id)
    end

    it "stores git_author_email (not author_email) in metadata" do
      described_class.new.perform(connector.id, "webhook", {
        "event_type" => "push",
        "payload" => push_payload
      })

      event = ToolEvent.last
      expect(event.metadata["git_author_email"]).to eq("dev@example.com")
      expect(event.metadata).not_to have_key("author_email")
    end

    it "leaves user_id nil when email does not match any org member" do
      push_payload["commits"].first["author"]["email"] = "unknown@example.com"

      described_class.new.perform(connector.id, "webhook", {
        "event_type" => "push",
        "payload" => push_payload
      })

      event = ToolEvent.last
      expect(event.user_id).to be_nil
    end
  end
end

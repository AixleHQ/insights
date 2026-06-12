# frozen_string_literal: true

require "rails_helper"

RSpec.describe PrCorrelationJob, type: :job do
  let(:organization) { create(:organization) }
  let(:connector) { create(:organization_connector, :github, :with_tokens, organization: organization) }
  let(:project) { create(:project, organization: organization) }

  let(:correlation_result) do
    { pr_number: 42, pr_url: "https://github.com/octocat/hello-world/pull/42", pr_state: "merged" }
  end

  def create_commit_event(metadata: {}, **attrs)
    create(
      :tool_event,
      organization: organization,
      event_type: "commit",
      metadata: { "commit_hash" => "abc123" }.merge(metadata),
      **attrs
    )
  end

  describe "#perform" do
    context "when the event has a repository_id" do
      let(:repository) { create(:repository, organization_connector: connector, project: project) }

      it "correlates via the event's repository and merges the result" do
        event = create_commit_event(repository: repository)
        allow(MetadataEnrichers::PrCorrelator).to receive(:call)
          .with(commit_hash: "abc123", repository: repository)
          .and_return(correlation_result)

        described_class.new.perform(event.id)

        event.reload
        expect(event.metadata["pr_number"]).to eq(42)
        expect(event.metadata["pr_url"]).to eq("https://github.com/octocat/hello-world/pull/42")
        expect(event.metadata["pr_state"]).to eq("merged")
        expect(event.metadata["commit_hash"]).to eq("abc123")
      end

      it "reads the sha key when commit_hash is absent" do
        event = create_commit_event(repository: repository, metadata: { "commit_hash" => nil, "sha" => "fff999" })
        event.update!(metadata: event.metadata.compact)
        allow(MetadataEnrichers::PrCorrelator).to receive(:call)
          .with(commit_hash: "fff999", repository: repository)
          .and_return(correlation_result)

        described_class.new.perform(event.id)

        expect(event.reload.metadata["pr_number"]).to eq(42)
      end
    end

    context "when the event has no repository but the project has one" do
      it "falls back to the project's repository" do
        repository = create(:repository, organization_connector: connector, project: project)
        event = create_commit_event(project: project)
        allow(MetadataEnrichers::PrCorrelator).to receive(:call)
          .with(commit_hash: "abc123", repository: repository)
          .and_return(correlation_result)

        described_class.new.perform(event.id)

        expect(event.reload.metadata["pr_number"]).to eq(42)
      end
    end

    context "when only the project's git_remote_url matches a repository full_name" do
      it "resolves the repository by git remote path" do
        repository = create(:repository, organization_connector: connector, project: nil, full_name: "octocat/hello-world")
        remote_project = create(:project, organization: organization, git_remote_url: "https://github.com/octocat/hello-world")
        event = create_commit_event(project: remote_project)
        allow(MetadataEnrichers::PrCorrelator).to receive(:call)
          .with(commit_hash: "abc123", repository: repository)
          .and_return(correlation_result)

        described_class.new.perform(event.id)

        expect(event.reload.metadata["pr_number"]).to eq(42)
      end
    end

    context "when no repository can be resolved" do
      it "stamps pr_lookup_status no_repo_link without calling the correlator" do
        event = create_commit_event(project: project)
        allow(MetadataEnrichers::PrCorrelator).to receive(:call)

        described_class.new.perform(event.id)

        expect(event.reload.metadata["pr_lookup_status"]).to eq("no_repo_link")
        expect(MetadataEnrichers::PrCorrelator).not_to have_received(:call)
      end
    end

    context "when the repository's connector is not github" do
      it "stamps no_repo_link without calling the correlator" do
        gitlab_connector = create(:organization_connector, :gitlab, organization: organization)
        repository = create(:repository, organization_connector: gitlab_connector, project: project)
        event = create_commit_event(repository: repository)
        allow(MetadataEnrichers::PrCorrelator).to receive(:call)

        described_class.new.perform(event.id)

        expect(event.reload.metadata["pr_lookup_status"]).to eq("no_repo_link")
        expect(MetadataEnrichers::PrCorrelator).not_to have_received(:call)
      end
    end

    context "when the event has no commit hash" do
      it "returns without stamping or calling the correlator" do
        repository = create(:repository, organization_connector: connector, project: project)
        event = create(
          :tool_event,
          organization: organization, event_type: "commit",
          repository: repository, metadata: { "branch_name" => "main" }
        )
        allow(MetadataEnrichers::PrCorrelator).to receive(:call)

        described_class.new.perform(event.id)

        expect(event.reload.metadata).not_to have_key("pr_lookup_status")
        expect(MetadataEnrichers::PrCorrelator).not_to have_received(:call)
      end
    end

    context "when the event no longer exists" do
      it "discards instead of raising" do
        expect {
          described_class.perform_now(-1)
        }.not_to raise_error
      end
    end

    it "preserves existing metadata keys when merging" do
      repository = create(:repository, organization_connector: connector, project: project)
      event = create_commit_event(repository: repository, metadata: { "jira_ticket" => "AIX-1", "cost_source" => "client" })
      allow(MetadataEnrichers::PrCorrelator).to receive(:call).and_return({ pr_lookup_status: "not_found" })

      described_class.new.perform(event.id)

      event.reload
      expect(event.metadata["jira_ticket"]).to eq("AIX-1")
      expect(event.metadata["cost_source"]).to eq("client")
      expect(event.metadata["pr_lookup_status"]).to eq("not_found")
    end
  end
end

# frozen_string_literal: true

require "rails_helper"

RSpec.describe WebhookRouter do
  let(:organization) { create(:organization) }

  describe ".dispatch" do
    let(:connector) { create(:organization_connector, organization: organization, connector_type: provider_type) }
    let(:event_type)  { "push" }
    let(:raw_key)     { "org/2026/05/01/14/abc123.enc" }
    let(:payload)     { { "action" => "push" } }
    let(:delivery_id) { SecureRandom.uuid }

    shared_examples "dispatches a webhook job" do |job_class_name|
      it "enqueues the correct job" do
        expect(job_class_name.constantize).to receive(:perform_later).with(
          connector.id,
          "webhook",
          hash_including(event_type: event_type, raw_key: raw_key, delivery_id: delivery_id)
        )
        described_class.dispatch(connector, event_type, raw_key, payload: payload, delivery_id: delivery_id)
      end

      it "includes payload in options" do
        expect(job_class_name.constantize).to receive(:perform_later).with(
          connector.id,
          "webhook",
          hash_including(payload: payload)
        )
        described_class.dispatch(connector, event_type, raw_key, payload: payload, delivery_id: delivery_id)
      end
    end

    context "github connector" do
      let(:provider_type) { "github" }
      include_examples "dispatches a webhook job", "GithubSyncJob"
    end

    context "gitlab connector" do
      let(:provider_type) { "gitlab" }
      include_examples "dispatches a webhook job", "GitlabSyncJob"
    end

    context "bitbucket connector" do
      let(:provider_type) { "bitbucket" }
      include_examples "dispatches a webhook job", "BitbucketSyncJob"
    end

    context "jira connector" do
      let(:provider_type) { "jira" }
      include_examples "dispatches a webhook job", "JiraSyncJob"
    end

    context "linear connector" do
      let(:provider_type) { "linear" }
      include_examples "dispatches a webhook job", "LinearSyncJob"
    end

    context "unsupported connector type" do
      let(:connector) { create(:organization_connector, organization: organization, connector_type: "anthropic") }

      it "does not enqueue any job" do
        expect(GithubSyncJob).not_to receive(:perform_later)
        described_class.dispatch(connector, event_type, raw_key)
      end
    end

    context "without payload or delivery_id" do
      let(:provider_type) { "github" }

      it "omits nil options from the hash" do
        expect(GithubSyncJob).to receive(:perform_later).with(
          connector.id,
          "webhook",
          { event_type: event_type, raw_key: raw_key }
        )
        described_class.dispatch(connector, event_type, raw_key)
      end
    end
  end
end

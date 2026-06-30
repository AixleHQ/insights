# frozen_string_literal: true

require "rails_helper"

RSpec.describe ConnectorConnectionProbe do
  let(:organization) { create(:organization) }
  let(:connector) do
    create(:organization_connector, organization: organization, connector_type: "github", status: "connected")
  end

  describe ".call" do
    it "marks error when test_connection fails" do
      allow_any_instance_of(Oauth::GithubProvider).to receive(:test_connection)
        .and_return({ success: false, error: "GitHub API error: 401" })

      described_class.call(connector)

      expect(connector.reload.status).to eq("error")
      expect(connector.last_error).to include("401")
    end

    it "leaves a healthy connected connector unchanged" do
      allow_any_instance_of(Oauth::GithubProvider).to receive(:test_connection)
        .and_return({ success: true, account: "octocat" })

      last_sync = connector.last_sync_at
      described_class.call(connector)

      connector.reload
      expect(connector.status).to eq("connected")
      expect(connector.last_error).to be_nil
      expect(connector.last_sync_at).to eq(last_sync)
    end

    it "clears last_error when a previously failing connector recovers" do
      connector.update!(status: "connected", last_error: "stale message")

      allow_any_instance_of(Oauth::GithubProvider).to receive(:test_connection)
        .and_return({ success: true, account: "octocat" })

      described_class.call(connector)

      expect(connector.reload.last_error).to be_nil
      expect(connector.status).to eq("connected")
    end

    it "does not probe connectors already in error state" do
      connector.update!(status: "error", last_error: "Token expired")

      expect(Oauth::BaseProvider).not_to receive(:for)

      described_class.call(connector)

      expect(connector.reload.status).to eq("error")
      expect(connector.last_error).to eq("Token expired")
    end

    it "does not probe connectors while sync is in progress" do
      connector.update!(status: "testing")

      expect(Oauth::BaseProvider).not_to receive(:for)

      described_class.call(connector)

      expect(connector.reload.status).to eq("testing")
    end
  end
end

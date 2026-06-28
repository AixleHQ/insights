# frozen_string_literal: true

require "rails_helper"

RSpec.describe CursorSyncJob, type: :job do
  let(:organization) { create(:organization) }
  let(:connector)    { create(:organization_connector, :cursor, organization: organization) }

  let(:seats_result) { { seat_count: 5 } }
  let(:spend_result) do
    {
      overage_spend_cents:   1250.75,
      overall_spend_cents:   4500.0,
      fast_premium_requests: 820,
      billing_cycle_start:   "2026-06-01T00:00:00Z",
      total_members:         5
    }
  end

  let(:provider_double) { instance_double(Oauth::CursorProvider) }

  describe "#perform" do
    before do
      allow(Oauth::CursorProvider).to receive(:new).with(connector).and_return(provider_double)
      allow(provider_double).to receive(:fetch_seats).and_return(seats_result)
      allow(provider_double).to receive(:fetch_spend).and_return(spend_result)
    end

    context "billing sync" do
      it "updates connector config with seat count and spend data" do
        described_class.new.perform(connector.id)

        connector.reload
        expect(connector.config["seat_count"]).to eq(5)
        expect(connector.config["overage_spend_cents"]).to eq(1250.75)
        expect(connector.config["overall_spend_cents"]).to eq(4500.0)
        expect(connector.config["fast_premium_requests"]).to eq(820)
        expect(connector.config["billing_cycle_start"]).to eq("2026-06-01T00:00:00Z")
      end

      it "marks the connector as synced" do
        described_class.new.perform(connector.id)

        connector.reload
        expect(connector.status).to eq("connected")
        expect(connector.last_sync_at).to be_present
      end

      it "does not create any ToolEvents" do
        expect {
          described_class.new.perform(connector.id)
        }.not_to change(ToolEvent, :count)
      end
    end

    context "idempotency" do
      it "merges config cleanly on second run without duplicating keys" do
        described_class.new.perform(connector.id)
        described_class.new.perform(connector.id)

        connector.reload
        expect(connector.config.keys).to match_array(
          %w[seat_count overage_spend_cents overall_spend_cents fast_premium_requests billing_cycle_start]
        )
      end
    end

    context "seat count mismatch" do
      before do
        allow(provider_double).to receive(:fetch_spend).and_return(spend_result.merge(total_members: 7))
      end

      it "logs a warning but still uses the /teams/members count" do
        allow(Rails.logger).to receive(:warn)

        described_class.new.perform(connector.id)

        expect(Rails.logger).to have_received(:warn).with(/Seat count mismatch/)
        expect(connector.reload.config["seat_count"]).to eq(5)
      end
    end

    context "error handling" do
      before do
        allow(provider_double).to receive(:fetch_seats).and_raise(RuntimeError, "API exploded")
      end

      it "calls mark_error! on the connector" do
        connector
        expect {
          described_class.new.perform(connector.id)
        }.to raise_error(RuntimeError, "API exploded")

        connector.reload
        expect(connector.status).to eq("error")
        expect(connector.last_error).to eq("API exploded")
      end

      it "re-raises the exception" do
        expect {
          described_class.new.perform(connector.id)
        }.to raise_error(RuntimeError, "API exploded")
      end
    end

    context "connector not found" do
      it "logs an error and does not raise" do
        expect {
          described_class.new.perform("nonexistent-id")
        }.not_to raise_error
      end
    end
  end

  describe ".enqueue_all" do
    include ActiveJob::TestHelper

    around do |example|
      queue_adapter = ActiveJob::Base.queue_adapter
      ActiveJob::Base.queue_adapter = :test
      example.run
      ActiveJob::Base.queue_adapter = queue_adapter
    end

    it "enqueues a job for each active cursor connector" do
      connector
      expect {
        described_class.enqueue_all
      }.to have_enqueued_job(described_class).with(connector.id)
    end

    it "does not enqueue jobs for other connector types" do
      create(:organization_connector, :github_copilot, organization: organization)

      expect {
        described_class.enqueue_all
      }.not_to have_enqueued_job(described_class)
    end
  end
end

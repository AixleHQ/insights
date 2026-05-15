require "rails_helper"

RSpec.describe UpdateTimescaleRetentionJob, type: :job do
  describe "#perform" do
    let(:job) { described_class.new }
    let(:connection) { instance_double(ActiveRecord::ConnectionAdapters::AbstractAdapter) }

    before do
      allow(ApplicationRecord).to receive(:connection).and_return(connection)
      allow(connection).to receive(:select_one).and_return(nil)
      allow(connection).to receive(:execute)
      allow(connection).to receive(:transaction).and_yield
    end

    context "when MAX_RETENTION_DAYS differs from the current policy" do
      before do
        allow(connection).to receive(:select_one).and_return({ "days" => 730 })
        stub_const("ENV", ENV.to_h.merge("MAX_RETENTION_DAYS" => "180"))
      end

      it "removes the old policy and adds a new one" do
        job.perform

        expect(connection).to have_received(:execute).with(
          "SELECT remove_retention_policy('timeseries.tool_events'::regclass)"
        )
        expect(connection).to have_received(:execute).with(
          "SELECT add_retention_policy('timeseries.tool_events'::regclass, '180 days'::interval)"
        )
      end

      it "logs the policy change" do
        allow(Rails.logger).to receive(:info)

        job.perform

        expect(Rails.logger).to have_received(:info).with(
          match(/Updating retention policy.*timeseries\.tool_events/)
        )
      end
    end

    context "when MAX_RETENTION_DAYS matches the current policy (idempotency)" do
      before do
        allow(connection).to receive(:select_one).and_return({ "days" => RetentionService::DEFAULT_RETENTION_DAYS })
        stub_const("ENV", ENV.to_h.merge("MAX_RETENTION_DAYS" => RetentionService::DEFAULT_RETENTION_DAYS.to_s))
      end

      it "does not execute remove/add" do
        job.perform

        expect(connection).not_to have_received(:execute).with(
          match(/remove_retention_policy/)
        )
        expect(connection).not_to have_received(:execute).with(
          match(/add_retention_policy/)
        )
      end

      it "logs a no-op message" do
        allow(Rails.logger).to receive(:info)

        job.perform

        expect(Rails.logger).to have_received(:info).with(
          match(/No change needed/)
        )
      end

      it "is safe to call multiple times without raising" do
        expect { 3.times { job.perform } }.not_to raise_error
      end
    end

    context "when no retention policy exists on the hypertable" do
      before do
        allow(connection).to receive(:select_one).and_return(nil)
        stub_const("ENV", ENV.to_h.merge("MAX_RETENTION_DAYS" => RetentionService::DEFAULT_RETENTION_DAYS.to_s))
      end

      it "skips remove and adds the policy" do
        job.perform

        expect(connection).not_to have_received(:execute).with(
          match(/remove_retention_policy/)
        )
        expect(connection).to have_received(:execute).with(
          "SELECT add_retention_policy('timeseries.tool_events'::regclass, '#{RetentionService::DEFAULT_RETENTION_DAYS} days'::interval)"
        )
      end
    end

    context "when MAX_RETENTION_DAYS is not set (default)" do
      before do
        # Current policy in DB must differ from default (730) or the job no-ops.
        allow(connection).to receive(:select_one).and_return({ "days" => 365 })
        stub_const("ENV", ENV.to_h.reject { |k, _| k == "MAX_RETENTION_DAYS" })
      end

      it "uses #{RetentionService::DEFAULT_RETENTION_DAYS} days as the default" do
        job.perform

        expect(connection).to have_received(:execute).with(
          "SELECT remove_retention_policy('timeseries.tool_events'::regclass)"
        )
        expect(connection).to have_received(:execute).with(
          "SELECT add_retention_policy('timeseries.tool_events'::regclass, '#{RetentionService::DEFAULT_RETENTION_DAYS} days'::interval)"
        )
      end
    end

    context "Sidekiq configuration" do
      it "uses the maintenance queue" do
        expect(described_class.sidekiq_options["queue"]).to eq("maintenance")
      end

      it "has retry set to 3" do
        expect(described_class.sidekiq_options["retry"]).to eq(3)
      end
    end
  end
end

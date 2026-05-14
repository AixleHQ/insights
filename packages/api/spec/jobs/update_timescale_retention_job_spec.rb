require "rails_helper"

RSpec.describe UpdateTimescaleRetentionJob, type: :job do
  describe "#perform" do
    let(:job) { described_class.new }
    let(:connection) { ApplicationRecord.connection }

    # Helpers to query the current TimescaleDB retention policy directly.
    def current_policy_days
      result = connection.select_one(<<~SQL)
        SELECT
          EXTRACT(EPOCH FROM (config->>'drop_after')::interval)::bigint / 86400 AS days
        FROM timescaledb_information.jobs
        WHERE proc_name = 'policy_retention'
          AND hypertable_schema || '.' || hypertable_name = 'timeseries.tool_events'
        LIMIT 1
      SQL
      result&.fetch("days")&.to_i
    end

    def restore_policy(days)
      connection.execute("SET search_path TO timeseries, public;")
      connection.execute("SELECT remove_retention_policy('tool_events');")
      connection.execute("SELECT add_retention_policy('tool_events', INTERVAL '#{days} days');")
      connection.execute("SET search_path TO public;")
    end

    context "when MAX_RETENTION_DAYS differs from the current policy" do
      around do |example|
        original_days = current_policy_days || 730
        example.run
      ensure
        restore_policy(original_days)
      end

      it "updates the TimescaleDB retention policy to the configured value" do
        stub_const("ENV", ENV.to_h.merge("MAX_RETENTION_DAYS" => "180"))

        job.perform

        expect(current_policy_days).to eq(180)
      end

      it "logs the policy change" do
        stub_const("ENV", ENV.to_h.merge("MAX_RETENTION_DAYS" => "180"))
        allow(Rails.logger).to receive(:info)

        job.perform

        expect(Rails.logger).to have_received(:info).with(
          match(/Updating retention policy.*timeseries\.tool_events/)
        )
      end
    end

    context "when MAX_RETENTION_DAYS matches the current policy (idempotency)" do
      around do |example|
        original_days = current_policy_days || 730
        example.run
      ensure
        restore_policy(original_days)
      end

      it "does not execute remove/add and logs a no-op message" do
        current = current_policy_days
        stub_const("ENV", ENV.to_h.merge("MAX_RETENTION_DAYS" => current.to_s))

        allow(connection).to receive(:execute).and_call_original
        allow(Rails.logger).to receive(:info)

        job.perform

        expect(connection).not_to have_received(:execute).with(
          match(/remove_retention_policy/)
        )
        expect(Rails.logger).to have_received(:info).with(
          match(/No change needed/)
        )
      end

      it "is safe to call multiple times without raising" do
        current = current_policy_days
        stub_const("ENV", ENV.to_h.merge("MAX_RETENTION_DAYS" => current.to_s))

        expect { 3.times { job.perform } }.not_to raise_error
      end
    end

    context "when no retention policy exists on the hypertable" do
      around do |example|
        original_days = current_policy_days || 730
        begin
          connection.execute("SET search_path TO timeseries, public;")
          connection.execute("SELECT remove_retention_policy('tool_events');")
          connection.execute("SET search_path TO public;")
        rescue ActiveRecord::StatementInvalid
          # no-op if already absent
        end
        example.run
      ensure
        restore_policy(original_days)
      end

      it "creates the policy without errors" do
        stub_const("ENV", ENV.to_h.merge("MAX_RETENTION_DAYS" => "365"))

        expect { job.perform }.not_to raise_error
        expect(current_policy_days).to eq(365)
      end
    end

    context "when MAX_RETENTION_DAYS is not set (default)" do
      around do |example|
        original_days = current_policy_days || 730
        example.run
      ensure
        restore_policy(original_days)
      end

      it "uses 365 days as the default" do
        stub_const("ENV", ENV.to_h.reject { |k, _| k == "MAX_RETENTION_DAYS" })

        job.perform

        expect(current_policy_days).to eq(365)
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

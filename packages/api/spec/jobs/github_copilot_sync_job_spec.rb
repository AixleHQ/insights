# frozen_string_literal: true

require "rails_helper"

RSpec.describe GithubCopilotSyncJob, type: :job do
  let(:organization) { create(:organization) }
  let(:connector) { create(:organization_connector, :github_copilot, organization: organization) }

  let(:usage_fixture) do
    JSON.parse(File.read(Rails.root.join("spec/fixtures/github_copilot_usage.json")))
  end

  let(:seats_fixture) do
    JSON.parse(File.read(Rails.root.join("spec/fixtures/github_copilot_seats.json")))
  end

  let(:provider_double) { instance_double(Oauth::GithubCopilotProvider) }

  before do
    allow(Oauth::GithubCopilotProvider).to receive(:new).with(connector).and_return(provider_double)
    allow(provider_double).to receive(:fetch_seats).and_return(seats_fixture)
  end

  describe "#perform — usage sync" do
    before do
      allow(provider_double).to receive(:fetch_usage).and_return(usage_fixture)
    end

    it "creates a ToolEvent for each day in the fixture" do
      expect {
        described_class.new.perform(connector.id)
      }.to change(ToolEvent, :count).by(2)
    end

    it "stores suggestion counts in tokens_in / tokens_out" do
      described_class.new.perform(connector.id)

      event = ToolEvent.find_by(
        tool_name: "github_copilot",
        occurred_at: Date.parse("2024-06-24").beginning_of_day.utc
      )
      # Day 1: python(249 suggestions, 123 acceptances) + ruby(100, 50) = 349, 173
      expect(event.tokens_in).to eq(349)
      expect(event.tokens_out).to eq(173)
    end

    it "normalises occurred_at to UTC midnight" do
      described_class.new.perform(connector.id)

      event = ToolEvent.find_by(tool_name: "github_copilot", occurred_at: Date.parse("2024-06-24").beginning_of_day.utc)
      expect(event).to be_present
      expect(event.occurred_at.utc).to eq(Date.parse("2024-06-24").beginning_of_day.utc)
    end

    it "sets cost_usd to a numeric value (not nil or a Hash)" do
      described_class.new.perform(connector.id)

      ToolEvent.where(tool_name: "github_copilot").each do |event|
        expect(event.cost_usd).to be_a(Numeric)
      end
    end

    it "sets event_type to completion" do
      described_class.new.perform(connector.id)

      ToolEvent.where(tool_name: "github_copilot").each do |event|
        expect(event.event_type).to eq("completion")
      end
    end

    it "stores lines metadata" do
      described_class.new.perform(connector.id)

      event = ToolEvent.find_by(tool_name: "github_copilot", occurred_at: Date.parse("2024-06-24").beginning_of_day.utc)
      expect(event.metadata["lines_suggested"]).to eq(315) # 225 + 90
      expect(event.metadata["lines_accepted"]).to eq(180)  # 135 + 45
    end

    it "is idempotent — running twice does not double-create events" do
      described_class.new.perform(connector.id)

      expect {
        described_class.new.perform(connector.id)
      }.not_to change(ToolEvent, :count)
    end

    it "updates connector last_sync_at (i.e. calls mark_synced!)" do
      described_class.new.perform(connector.id)
      connector.reload
      expect(connector.last_sync_at).to be_present
    end
  end

  describe "#perform — empty usage response" do
    before do
      allow(provider_double).to receive(:fetch_usage).and_return([])
    end

    it "does not create any ToolEvent rows" do
      expect {
        described_class.new.perform(connector.id)
      }.not_to change(ToolEvent, :count)
    end

    it "still updates last_sync_at on the connector" do
      described_class.new.perform(connector.id)
      connector.reload
      expect(connector.last_sync_at).to be_present
    end
  end

  describe "#perform — seat sync" do
    before do
      allow(provider_double).to receive(:fetch_usage).and_return([])
    end

    it "updates connector config with seat_count and active_users" do
      described_class.new.perform(connector.id)

      connector.reload
      expect(connector.config["seat_count"]).to eq(2)
      expect(connector.config["active_users"]).to eq(1) # only first seat has last_activity_at
    end
  end

  describe "#perform — error handling" do
    before do
      allow(provider_double).to receive(:fetch_usage).and_raise(RuntimeError, "API exploded")
    end

    it "calls mark_error! on the connector" do
      connector # ensure record exists before error
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

  describe "#perform — connector not found" do
    it "logs an error and does not raise" do
      expect {
        described_class.new.perform("nonexistent-id")
      }.not_to raise_error
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

    it "enqueues a job for each active github_copilot connector" do
      connector # create the connector
      expect {
        described_class.enqueue_all
      }.to have_enqueued_job(described_class).with(connector.id)
    end
  end
end

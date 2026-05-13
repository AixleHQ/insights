require "rails_helper"

RSpec.describe ProjectRetentionPolicy, type: :model do
  describe "alert threshold columns" do
    it { expect(described_class.column_names).to include("cost_threshold_cents", "token_threshold", "alert_enabled") }
  end

  describe "constants" do
    it "defines valid raw event TTLs" do
      expect(ProjectRetentionPolicy::RAW_EVENT_TTLS).to eq(%w[6_hours 12_hours 24_hours 48_hours 72_hours])
    end

    it "defines valid tool events retentions" do
      expect(ProjectRetentionPolicy::TOOL_EVENTS_RETENTIONS).to eq(%w[30_days 60_days 90_days 180_days 365_days 730_days])
    end

    it "defines valid hourly aggregate retentions" do
      expect(ProjectRetentionPolicy::HOURLY_AGGREGATE_RETENTIONS).to eq(%w[90_days 180_days 365_days 730_days])
    end

    it "defines valid daily aggregate retentions" do
      expect(ProjectRetentionPolicy::DAILY_AGGREGATE_RETENTIONS).to eq(%w[365_days 730_days 1095_days forever])
    end
  end

  describe "associations" do
    it { should belong_to(:project) }
    it { should belong_to(:updated_by).class_name("User").optional }
  end

  describe "validations" do
    it "enforces one policy per project" do
      project = create(:project, owner: create(:user), organization: nil)
      # Project callback creates retention policy automatically
      expect(project.retention_policy).to be_present

      # Trying to create another should fail
      duplicate = build(:project_retention_policy, project: project)
      expect(duplicate).not_to be_valid
    end

    it { should validate_inclusion_of(:raw_event_ttl).in_array(ProjectRetentionPolicy::RAW_EVENT_TTLS) }
    it { should validate_inclusion_of(:tool_events_retention).in_array(ProjectRetentionPolicy::TOOL_EVENTS_RETENTIONS) }
    it { should validate_inclusion_of(:hourly_aggregate_retention).in_array(ProjectRetentionPolicy::HOURLY_AGGREGATE_RETENTIONS) }
    it { should validate_inclusion_of(:daily_aggregate_retention).in_array(ProjectRetentionPolicy::DAILY_AGGREGATE_RETENTIONS) }

    describe "invalid enum values are rejected" do
      it "rejects an invalid raw_event_ttl" do
        policy = build(:project_retention_policy, raw_event_ttl: "1_year")
        expect(policy).not_to be_valid
        expect(policy.errors[:raw_event_ttl]).to be_present
      end

      it "rejects an invalid tool_events_retention" do
        policy = build(:project_retention_policy, tool_events_retention: "7_days")
        expect(policy).not_to be_valid
        expect(policy.errors[:tool_events_retention]).to be_present
      end

      it "rejects an invalid hourly_aggregate_retention" do
        policy = build(:project_retention_policy, hourly_aggregate_retention: "30_days")
        expect(policy).not_to be_valid
        expect(policy.errors[:hourly_aggregate_retention]).to be_present
      end

      it "rejects an invalid daily_aggregate_retention" do
        policy = build(:project_retention_policy, daily_aggregate_retention: "90_days")
        expect(policy).not_to be_valid
        expect(policy.errors[:daily_aggregate_retention]).to be_present
      end

      it "rejects blank values" do
        policy = build(:project_retention_policy, raw_event_ttl: "")
        expect(policy).not_to be_valid
      end
    end
  end

  describe "#raw_event_ttl_duration" do
    it "parses hours correctly" do
      policy = build(:project_retention_policy, raw_event_ttl: "24_hours")
      expect(policy.raw_event_ttl_duration).to eq(24.hours)
    end
  end

  describe "#tool_events_retention_duration" do
    it "parses days correctly" do
      policy = build(:project_retention_policy, tool_events_retention: "90_days")
      expect(policy.tool_events_retention_duration).to eq(90.days)
    end
  end

  describe "#hourly_aggregate_retention_duration" do
    it "parses days correctly" do
      policy = build(:project_retention_policy, hourly_aggregate_retention: "180_days")
      expect(policy.hourly_aggregate_retention_duration).to eq(180.days)
    end
  end

  describe "#daily_aggregate_retention_duration" do
    it "parses days correctly" do
      policy = build(:project_retention_policy, daily_aggregate_retention: "730_days")
      expect(policy.daily_aggregate_retention_duration).to eq(730.days)
    end

    it "returns nil for forever" do
      policy = build(:project_retention_policy, daily_aggregate_retention: "forever")
      expect(policy.daily_aggregate_retention_duration).to be_nil
    end
  end
end

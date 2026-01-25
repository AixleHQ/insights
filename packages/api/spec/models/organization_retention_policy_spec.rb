require 'rails_helper'

RSpec.describe OrganizationRetentionPolicy, type: :model do
  describe 'constants' do
    it 'defines valid raw event TTLs' do
      expect(OrganizationRetentionPolicy::RAW_EVENT_TTLS).to eq(%w[6_hours 12_hours 24_hours 48_hours 72_hours])
    end

    it 'defines valid tool events retentions' do
      expect(OrganizationRetentionPolicy::TOOL_EVENTS_RETENTIONS).to eq(%w[30_days 60_days 90_days 180_days 365_days 730_days])
    end

    it 'defines valid hourly aggregate retentions' do
      expect(OrganizationRetentionPolicy::HOURLY_AGGREGATE_RETENTIONS).to eq(%w[90_days 180_days 365_days 730_days])
    end

    it 'defines valid daily aggregate retentions' do
      expect(OrganizationRetentionPolicy::DAILY_AGGREGATE_RETENTIONS).to eq(%w[365_days 730_days 1095_days forever])
    end
  end

  describe 'associations' do
    it { should belong_to(:organization) }
    it { should belong_to(:updated_by).class_name('User').optional }
  end

  describe 'validations' do
    # Note: organization is auto-created with retention policy,
    # so we test uniqueness differently
    it 'enforces one policy per organization' do
      org = create(:organization)
      # Organization callback creates retention policy automatically
      expect(org.retention_policy).to be_present

      # Trying to create another should fail
      duplicate = build(:organization_retention_policy, organization: org)
      expect(duplicate).not_to be_valid
    end

    it { should validate_inclusion_of(:raw_event_ttl).in_array(OrganizationRetentionPolicy::RAW_EVENT_TTLS) }
    it { should validate_inclusion_of(:tool_events_retention).in_array(OrganizationRetentionPolicy::TOOL_EVENTS_RETENTIONS) }
    it { should validate_inclusion_of(:hourly_aggregate_retention).in_array(OrganizationRetentionPolicy::HOURLY_AGGREGATE_RETENTIONS) }
    it { should validate_inclusion_of(:daily_aggregate_retention).in_array(OrganizationRetentionPolicy::DAILY_AGGREGATE_RETENTIONS) }
  end

  describe '#raw_event_ttl_duration' do
    it 'parses hours correctly' do
      policy = build(:organization_retention_policy, raw_event_ttl: '24_hours')
      expect(policy.raw_event_ttl_duration).to eq(24.hours)
    end
  end

  describe '#tool_events_retention_duration' do
    it 'parses days correctly' do
      policy = build(:organization_retention_policy, tool_events_retention: '90_days')
      expect(policy.tool_events_retention_duration).to eq(90.days)
    end
  end

  describe '#hourly_aggregate_retention_duration' do
    it 'parses days correctly' do
      policy = build(:organization_retention_policy, hourly_aggregate_retention: '180_days')
      expect(policy.hourly_aggregate_retention_duration).to eq(180.days)
    end
  end

  describe '#daily_aggregate_retention_duration' do
    it 'parses days correctly' do
      policy = build(:organization_retention_policy, daily_aggregate_retention: '730_days')
      expect(policy.daily_aggregate_retention_duration).to eq(730.days)
    end

    it 'returns nil for forever' do
      policy = build(:organization_retention_policy, daily_aggregate_retention: 'forever')
      expect(policy.daily_aggregate_retention_duration).to be_nil
    end
  end
end

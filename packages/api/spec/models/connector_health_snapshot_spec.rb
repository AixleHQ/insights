require 'rails_helper'

RSpec.describe ConnectorHealthSnapshot, type: :model do
  describe 'associations' do
    it { should belong_to(:organization_connector) }
  end

  describe 'validations' do
    subject { build(:connector_health_snapshot) }

    it { should validate_presence_of(:status) }
    it { should validate_presence_of(:snapshotted_at) }
    it { should validate_inclusion_of(:status).in_array(%w[success failure]) }
  end

  describe '.stats_for_org' do
    let(:organization) { create(:organization) }
    let(:connector) { create(:organization_connector, organization: organization) }
    let(:other_org_connector) { create(:organization_connector) }
    let(:since) { 7.days.ago }

    it 'returns empty hash when no snapshots exist' do
      result = described_class.stats_for_org(organization.id, since: since)
      expect(result).to eq({})
    end

    it 'returns aggregated stats keyed by connector id' do
      create(:connector_health_snapshot, :success, organization_connector: connector, sync_duration_ms: 1000, snapshotted_at: 1.day.ago)
      create(:connector_health_snapshot, :success, organization_connector: connector, sync_duration_ms: 2000, snapshotted_at: 2.days.ago)
      create(:connector_health_snapshot, :failure, organization_connector: connector, sync_duration_ms: 500, snapshotted_at: 3.days.ago)

      result = described_class.stats_for_org(organization.id, since: since)

      expect(result).to have_key(connector.id)
      stats = result[connector.id]
      expect(stats[:success_count]).to eq(2)
      expect(stats[:failure_count]).to eq(1)
      expect(stats[:avg_duration_ms]).to be_within(1).of(1166.67)
      expect(stats[:last_snapshotted_at]).to be_present
    end

    it 'excludes snapshots outside the time window' do
      create(:connector_health_snapshot, :success, organization_connector: connector, snapshotted_at: 1.day.ago)
      create(:connector_health_snapshot, :failure, organization_connector: connector, snapshotted_at: 10.days.ago)

      result = described_class.stats_for_org(organization.id, since: since)

      stats = result[connector.id]
      expect(stats[:success_count]).to eq(1)
      expect(stats[:failure_count]).to eq(0)
    end

    it 'does not leak data across organizations' do
      create(:connector_health_snapshot, :success, organization_connector: other_org_connector, snapshotted_at: 1.day.ago)

      result = described_class.stats_for_org(organization.id, since: since)
      expect(result).not_to have_key(other_org_connector.id)
    end

    it 'returns nil avg_duration_ms when all durations are null' do
      create(:connector_health_snapshot, organization_connector: connector, sync_duration_ms: nil, snapshotted_at: 1.day.ago)

      result = described_class.stats_for_org(organization.id, since: since)
      expect(result[connector.id][:avg_duration_ms]).to be_nil
    end
  end

  describe 'RETENTION_WINDOW' do
    it 'is 90 days' do
      expect(ConnectorHealthSnapshot::RETENTION_WINDOW).to eq(90.days)
    end
  end
end

# frozen_string_literal: true

require 'rails_helper'

RSpec.describe AttributionJob, type: :job do
  let(:organization) { create(:organization) }
  let(:user) { create(:user) }

  before do
    create(:organization_membership, user: user, organization: organization)
  end

  describe '#perform' do
    it 'processes all organizations when no ID provided' do
      allow(Ai::CorrelationService).to receive(:correlate_unattributed)
        .and_return({ correlated: 5, failed: 2 })

      stats = described_class.new.perform

      expect(stats[:organizations_processed]).to be >= 1
      expect(Ai::CorrelationService).to have_received(:correlate_unattributed)
        .at_least(:once)
    end

    it 'processes specific organization when ID provided' do
      expect(Ai::CorrelationService).to receive(:correlate_unattributed)
        .with(organization: organization, limit: 1000, min_confidence: 0.7)
        .and_return({ correlated: 3, failed: 1 })

      stats = described_class.new.perform(organization.id)

      expect(stats[:organizations_processed]).to eq(1)
      expect(stats[:events_attributed]).to eq(3)
    end

    it 'respects custom batch size' do
      expect(Ai::CorrelationService).to receive(:correlate_unattributed)
        .with(organization: organization, limit: 500, min_confidence: 0.7)
        .and_return({ correlated: 0, failed: 0 })

      described_class.new.perform(organization.id, { 'batch_size' => 500 })
    end

    it 'uses org-level min_attribution_confidence when set' do
      OrganizationSetting.set(organization, 'min_attribution_confidence', '0.85')

      expect(Ai::CorrelationService).to receive(:correlate_unattributed)
        .with(organization: organization, limit: 1000, min_confidence: 0.85)
        .and_return({ correlated: 0, failed: 0 })

      described_class.new.perform(organization.id)
    end
  end
end

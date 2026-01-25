require 'rails_helper'

RSpec.describe RetentionService do
  describe '.for_organization' do
    context 'when organization has default retention policy' do
      let(:organization) { create(:organization) }

      it 'returns default values from auto-created policy' do
        result = described_class.for_organization(organization)

        expect(result).to eq({
          raw_event_ttl: '24_hours',
          tool_events_retention: '90_days',
          hourly_aggregate_retention: '365_days',
          daily_aggregate_retention: 'forever'
        })
      end
    end

    context 'when organization has custom retention policy' do
      let(:organization) { create(:organization) }

      before do
        organization.retention_policy.update!(
          raw_event_ttl: '48_hours',
          tool_events_retention: '365_days',
          hourly_aggregate_retention: '730_days',
          daily_aggregate_retention: '1095_days'
        )
      end

      it 'returns the organization policy values' do
        result = described_class.for_organization(organization)

        expect(result).to eq({
          raw_event_ttl: '48_hours',
          tool_events_retention: '365_days',
          hourly_aggregate_retention: '730_days',
          daily_aggregate_retention: '1095_days'
        })
      end
    end

    context 'with various retention settings' do
      let(:organization) { create(:organization) }

      before do
        organization.retention_policy.update!(
          raw_event_ttl: '6_hours',
          tool_events_retention: '30_days',
          hourly_aggregate_retention: '90_days',
          daily_aggregate_retention: 'forever'
        )
      end

      it 'returns the correct policy values' do
        result = described_class.for_organization(organization)

        expect(result[:raw_event_ttl]).to eq('6_hours')
        expect(result[:tool_events_retention]).to eq('30_days')
        expect(result[:hourly_aggregate_retention]).to eq('90_days')
        expect(result[:daily_aggregate_retention]).to eq('forever')
      end
    end
  end

  describe '.retention_cutoff' do
    let(:organization) { create(:organization) }

    context 'when retention is forever' do
      before do
        organization.retention_policy.update!(daily_aggregate_retention: 'forever')
      end

      it 'returns nil' do
        cutoff = described_class.retention_cutoff(organization, :daily_aggregate_retention)
        expect(cutoff).to be_nil
      end
    end

    context 'when retention is a duration' do
      before do
        organization.retention_policy.update!(tool_events_retention: '90_days')
      end

      it 'returns the correct cutoff date' do
        freeze_time do
          cutoff = described_class.retention_cutoff(organization, :tool_events_retention)
          expect(cutoff).to eq(90.days.ago)
        end
      end
    end

    context 'with different duration units' do
      it 'handles hours correctly' do
        organization.retention_policy.update!(raw_event_ttl: '24_hours')

        freeze_time do
          cutoff = described_class.retention_cutoff(organization, :raw_event_ttl)
          expect(cutoff).to eq(24.hours.ago)
        end
      end

      it 'handles days correctly' do
        organization.retention_policy.update!(tool_events_retention: '180_days')

        freeze_time do
          cutoff = described_class.retention_cutoff(organization, :tool_events_retention)
          expect(cutoff).to eq(180.days.ago)
        end
      end
    end

    context 'with HIPAA retention' do
      before do
        organization.retention_policy.update!(tool_events_retention: '730_days')
      end

      it 'returns 2 years ago' do
        freeze_time do
          cutoff = described_class.retention_cutoff(organization, :tool_events_retention)
          expect(cutoff).to eq(730.days.ago)
        end
      end
    end
  end

  describe '.retention_options' do
    it 'returns options for raw_event_ttl' do
      options = described_class.retention_options(:raw_event_ttl)

      expect(options.length).to eq(5)
      expect(options.first).to include(value: '6_hours', label: '6 hours')
      expect(options.find { |o| o[:value] == '24_hours' }[:default]).to be true
    end

    it 'returns options for tool_events_retention' do
      options = described_class.retention_options(:tool_events_retention)

      expect(options.length).to eq(6)
      expect(options.find { |o| o[:value] == '365_days' }[:label]).to eq('1 year (SOC2)')
      expect(options.find { |o| o[:value] == '730_days' }[:label]).to eq('2 years (HIPAA)')
      expect(options.find { |o| o[:value] == '90_days' }[:default]).to be true
    end

    it 'returns options for hourly_aggregate_retention' do
      options = described_class.retention_options(:hourly_aggregate_retention)

      expect(options.length).to eq(4)
      expect(options.find { |o| o[:value] == '365_days' }[:default]).to be true
    end

    it 'returns options for daily_aggregate_retention' do
      options = described_class.retention_options(:daily_aggregate_retention)

      expect(options.length).to eq(4)
      expect(options.find { |o| o[:value] == 'forever' }[:label]).to eq('Forever')
      expect(options.find { |o| o[:value] == 'forever' }[:default]).to be true
    end

    it 'raises error for unknown retention type' do
      expect { described_class.retention_options(:unknown) }
        .to raise_error(ArgumentError, 'Unknown retention type: unknown')
    end
  end

  describe '.all_options' do
    it 'returns options for all retention types' do
      options = described_class.all_options

      expect(options.keys).to contain_exactly(
        :raw_event_ttl,
        :tool_events_retention,
        :hourly_aggregate_retention,
        :daily_aggregate_retention
      )

      expect(options[:raw_event_ttl]).to be_an(Array)
      expect(options[:tool_events_retention]).to be_an(Array)
    end
  end

  describe 'DEFAULTS' do
    it 'has correct default values' do
      expect(RetentionService::DEFAULTS).to eq({
        raw_event_ttl: '24_hours',
        tool_events_retention: '90_days',
        hourly_aggregate_retention: '365_days',
        daily_aggregate_retention: 'forever'
      })
    end
  end
end

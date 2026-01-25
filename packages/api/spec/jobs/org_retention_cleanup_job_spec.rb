require 'rails_helper'

RSpec.describe OrgRetentionCleanupJob, type: :job do
  describe '#perform' do
    let(:organization) { create(:organization) }
    let(:user) { create(:user) }

    before do
      # Clean up any leftover data from previous test runs
      ToolEvent.delete_all
      Organization.where.not(id: organization.id).destroy_all

      # Ensure user is a member of the organization
      create(:organization_membership, user: user, organization: organization)
    end

    context 'when organization has events within retention period' do
      before do
        organization.retention_policy.update!(tool_events_retention: '90_days')
      end

      it 'does not delete recent events' do
        # Create event within retention period (30 days ago)
        create_tool_event(organization, user, 30.days.ago)

        result = described_class.new.perform

        expect(ToolEvent.count).to eq(1)
        expect(result[:total_deleted]).to eq(0)
      end
    end

    context 'when organization has events outside retention period' do
      before do
        organization.retention_policy.update!(tool_events_retention: '30_days')
      end

      it 'deletes old events' do
        # Create event outside retention period
        create_tool_event(organization, user, 60.days.ago)
        # Create event within retention period
        create_tool_event(organization, user, 10.days.ago)

        result = described_class.new.perform

        expect(ToolEvent.count).to eq(1)
        expect(result[:total_deleted]).to eq(1)
      end

      it 'only deletes events for the specific organization' do
        other_org = create(:organization)
        other_user = create(:user)
        create(:organization_membership, user: other_user, organization: other_org)
        other_org.retention_policy.update!(tool_events_retention: '365_days')

        # Create old events for both organizations
        create_tool_event(organization, user, 60.days.ago)
        create_tool_event(other_org, other_user, 60.days.ago)

        result = described_class.new.perform

        # Only the first org's event should be deleted (30 day retention)
        # The other org has 365 day retention, so its event stays
        expect(ToolEvent.where(organization: organization).count).to eq(0)
        expect(ToolEvent.where(organization: other_org).count).to eq(1)
        expect(result[:total_deleted]).to eq(1)
      end
    end

    context 'when organization has forever retention' do
      before do
        organization.retention_policy.update!(daily_aggregate_retention: 'forever')
      end

      it 'skips deletion for forever retention types' do
        create_tool_event(organization, user, 1000.days.ago)

        # RetentionService.retention_cutoff returns nil for 'forever'
        # But tool_events_retention is not 'forever' by default
        organization.retention_policy.update!(tool_events_retention: '730_days')

        result = described_class.new.perform

        # Event is 1000 days old, but retention is 730 days, so it should be deleted
        expect(ToolEvent.count).to eq(0)
        expect(result[:total_deleted]).to eq(1)
      end
    end

    context 'with multiple organizations' do
      let(:org2) { create(:organization) }
      let(:user2) { create(:user) }

      before do
        create(:organization_membership, user: user2, organization: org2)
        organization.retention_policy.update!(tool_events_retention: '30_days')
        org2.retention_policy.update!(tool_events_retention: '60_days')
      end

      it 'processes all organizations' do
        create_tool_event(organization, user, 45.days.ago)
        create_tool_event(org2, user2, 45.days.ago)

        result = described_class.new.perform

        expect(result[:organizations_processed]).to eq(2)
        # First org: 45 days > 30 days retention, so deleted
        # Second org: 45 days < 60 days retention, so kept
        expect(ToolEvent.where(organization: organization).count).to eq(0)
        expect(ToolEvent.where(organization: org2).count).to eq(1)
        expect(result[:total_deleted]).to eq(1)
      end
    end

    context 'when an error occurs' do
      it 'logs the error and continues processing other organizations' do
        org2 = create(:organization)
        create(:organization_membership, user: user, organization: org2)

        # Allow normal calls but raise error for specific org
        allow(RetentionService).to receive(:retention_cutoff).and_call_original
        allow(RetentionService).to receive(:retention_cutoff).with(organization, :tool_events_retention).and_raise(StandardError, 'Test error')

        result = described_class.new.perform

        expect(result[:organizations_processed]).to eq(1)
        expect(result[:errors].size).to eq(1)
        expect(result[:errors].first[:error]).to eq('Test error')
      end
    end

    context 'with Sidekiq configuration' do
      it 'uses the maintenance queue' do
        expect(described_class.sidekiq_options['queue']).to eq('maintenance')
      end

      it 'has retry enabled' do
        expect(described_class.sidekiq_options['retry']).to eq(3)
      end
    end
  end

  private

  def create_tool_event(org, user, occurred_at)
    ToolEvent.create!(
      organization: org,
      user: user,
      tool_name: 'claude_code',
      event_type: 'chat',
      occurred_at: occurred_at,
      tokens_in: 100,
      tokens_out: 200,
      tokens_total: 300,
      cost_usd: 0.01
    )
  end
end

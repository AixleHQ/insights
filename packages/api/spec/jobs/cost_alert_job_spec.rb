# frozen_string_literal: true

require 'rails_helper'

RSpec.describe CostAlertJob, type: :job do
  let(:organization) { create(:organization) }
  let(:user) { create(:user) }

  before do
    create(:organization_membership, user: user, organization: organization)
    allow(EventsChannel).to receive(:broadcast_alert)
    allow(Rails.cache).to receive(:read).and_return(nil)
    allow(Rails.cache).to receive(:write)
    allow(Slack::NotificationService).to receive(:deliver_alert)
  end

  describe '#perform' do
    context 'when daily cost exceeds threshold' do
      before do
        create(:tool_event,
               organization: organization,
               user: user,
               cost_usd: 150.0,
               occurred_at: Time.current)
      end

      it 'sends a daily cost alert' do
        expect(EventsChannel).to receive(:broadcast_alert)
          .with(organization.id, hash_including(type: 'cost_threshold', period: 'daily'))

        described_class.new.perform(organization.id)
      end
    end

    context 'when costs are below threshold' do
      before do
        create(:tool_event,
               organization: organization,
               user: user,
               cost_usd: 10.0,
               occurred_at: Time.current)
      end

      it 'does not send alerts' do
        expect(EventsChannel).not_to receive(:broadcast_alert)

        described_class.new.perform(organization.id)
      end
    end

    context 'when alert was already sent today' do
      before do
        create(:tool_event,
               organization: organization,
               user: user,
               cost_usd: 150.0,
               occurred_at: Time.current)
        allow(Rails.cache).to receive(:read).and_return(true)
      end

      it 'does not send duplicate alerts' do
        expect(EventsChannel).not_to receive(:broadcast_alert)

        described_class.new.perform(organization.id)
      end
    end

    it 'returns stats summary' do
      stats = described_class.new.perform(organization.id)

      expect(stats).to have_key(:organizations_checked)
      expect(stats).to have_key(:alerts_sent)
      expect(stats).to have_key(:errors)
    end

    context 'when alert_slack is enabled' do
      before do
        create(:organization_setting, organization: organization, key: 'alert_slack', value: 'true')
        create(:tool_event, organization: organization, user: user, cost_usd: 150.0, occurred_at: Time.current)
      end

      it 'delivers the cost alert to Slack' do
        expect(Slack::NotificationService).to receive(:deliver_alert)
          .with(organization, hash_including(alert_type: 'cost_threshold'))

        described_class.new.perform(organization.id)
      end
    end

    context 'when alert_slack is disabled' do
      before do
        create(:tool_event, organization: organization, user: user, cost_usd: 150.0, occurred_at: Time.current)
      end

      it 'does not deliver to Slack' do
        expect(Slack::NotificationService).not_to receive(:deliver_alert)

        described_class.new.perform(organization.id)
      end
    end

    context 'when alert_slack is enabled but no Slack connector exists' do
      before do
        create(:organization_setting, organization: organization, key: 'alert_slack', value: 'true')
        create(:tool_event, organization: organization, user: user, cost_usd: 150.0, occurred_at: Time.current)
        allow(Slack::NotificationService).to receive(:deliver_alert).and_call_original
        allow(Rails.logger).to receive(:warn)
      end

      it 'does not raise an error' do
        expect { described_class.new.perform(organization.id) }.not_to raise_error
      end
    end
  end
end

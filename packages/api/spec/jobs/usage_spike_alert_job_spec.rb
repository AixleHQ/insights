# frozen_string_literal: true

require 'rails_helper'

RSpec.describe UsageSpikeAlertJob, type: :job do
  let(:organization) { create(:organization) }
  let(:user) { create(:user) }

  before do
    create(:organization_membership, user: user, organization: organization)
    create(:organization_setting, organization: organization, key: 'alert_usage_spike', value: 'true')
    allow(EventsChannel).to receive(:broadcast_alert)
    allow(Rails.cache).to receive(:read).and_return(nil)
    allow(Rails.cache).to receive(:write)
    allow(Slack::NotificationService).to receive(:deliver_alert)
    allow(Slack::ProjectNotificationService).to receive(:deliver_alert)
  end

  describe '#perform' do
    context 'when current hour cost is a spike above baseline' do
      before do
        # Baseline: 1 event per day at same hour over 7 days = avg $5/hr
        7.times do |i|
          create(:tool_event,
                 organization: organization,
                 user: user,
                 cost_usd: 5.0,
                 occurred_at: (i + 1).days.ago.change(hour: Time.current.hour))
        end
        # Current hour: $50 (10x baseline)
        create(:tool_event,
               organization: organization,
               user: user,
               cost_usd: 50.0,
               occurred_at: Time.current)
      end

      it 'broadcasts a usage spike alert' do
        expect(EventsChannel).to receive(:broadcast_alert)
          .with(organization.id, hash_including(type: 'usage_spike', alert_type: 'usage_spike'))

        described_class.new.perform(organization.id)
      end

      it 'returns stats summary' do
        stats = described_class.new.perform(organization.id)

        expect(stats).to have_key(:organizations_checked)
        expect(stats).to have_key(:alerts_sent)
        expect(stats[:alerts_sent]).to eq(1)
      end
    end

    context 'when cost is below the spike multiplier' do
      before do
        7.times do |i|
          create(:tool_event,
                 organization: organization,
                 user: user,
                 cost_usd: 5.0,
                 occurred_at: (i + 1).days.ago.change(hour: Time.current.hour))
        end
        # Current: $10 (2x baseline, below default 3x threshold)
        create(:tool_event,
               organization: organization,
               user: user,
               cost_usd: 10.0,
               occurred_at: Time.current)
      end

      it 'does not send an alert' do
        expect(EventsChannel).not_to receive(:broadcast_alert)

        described_class.new.perform(organization.id)
      end
    end

    context 'when baseline cost is too low (noise guard)' do
      before do
        # baseline avg < $1 minimum
        7.times do |i|
          create(:tool_event,
                 organization: organization,
                 user: user,
                 cost_usd: 0.05,
                 occurred_at: (i + 1).days.ago.change(hour: Time.current.hour))
        end
        create(:tool_event,
               organization: organization,
               user: user,
               cost_usd: 5.0,
               occurred_at: Time.current)
      end

      it 'does not send an alert' do
        expect(EventsChannel).not_to receive(:broadcast_alert)

        described_class.new.perform(organization.id)
      end
    end

    context 'when alert_usage_spike is disabled' do
      before do
        organization.organization_settings.find_by(key: 'alert_usage_spike').update!(value: 'false')
        7.times do |i|
          create(:tool_event,
                 organization: organization,
                 user: user,
                 cost_usd: 5.0,
                 occurred_at: (i + 1).days.ago.change(hour: Time.current.hour))
        end
        create(:tool_event,
               organization: organization,
               user: user,
               cost_usd: 50.0,
               occurred_at: Time.current)
      end

      it 'does not send an alert' do
        expect(EventsChannel).not_to receive(:broadcast_alert)

        described_class.new.perform(organization.id)
      end
    end

    context 'when alert was already sent this hour' do
      before do
        allow(Rails.cache).to receive(:read).and_return(true)
        7.times do |i|
          create(:tool_event,
                 organization: organization,
                 user: user,
                 cost_usd: 5.0,
                 occurred_at: (i + 1).days.ago.change(hour: Time.current.hour))
        end
        create(:tool_event,
               organization: organization,
               user: user,
               cost_usd: 50.0,
               occurred_at: Time.current)
      end

      it 'does not send a duplicate alert' do
        expect(EventsChannel).not_to receive(:broadcast_alert)

        described_class.new.perform(organization.id)
      end
    end

    context 'org-level Slack delivery' do
      before do
        create(:organization_setting, organization: organization, key: 'alert_slack', value: 'true')
        7.times do |i|
          create(:tool_event,
                 organization: organization,
                 user: user,
                 cost_usd: 5.0,
                 occurred_at: (i + 1).days.ago.change(hour: Time.current.hour))
        end
        create(:tool_event,
               organization: organization,
               user: user,
               cost_usd: 50.0,
               occurred_at: Time.current)
      end

      it 'delivers to org Slack when alert_slack is enabled' do
        expect(Slack::NotificationService).to receive(:deliver_alert)
          .with(organization, hash_including(alert_type: 'usage_spike'))

        described_class.new.perform(organization.id)
      end
    end

    context 'project-level Slack delivery' do
      let(:project) { create(:project, organization: organization) }

      before do
        7.times do |i|
          create(:tool_event,
                 organization: organization,
                 user: user,
                 cost_usd: 5.0,
                 occurred_at: (i + 1).days.ago.change(hour: Time.current.hour))
        end
        create(:tool_event,
               organization: organization,
               user: user,
               cost_usd: 50.0,
               occurred_at: Time.current)
      end

      context 'when a project has alert_slack enabled and an active Slack connector' do
        before do
          create(:project_setting, project: project, key: 'alert_slack', value: 'true')
          create(:project_connector, :slack, project: project)
        end

        it 'delivers the usage spike alert to the project Slack webhook' do
          expect(Slack::ProjectNotificationService).to receive(:deliver_alert)
            .with(project, hash_including(alert_type: 'usage_spike'))

          described_class.new.perform(organization.id)
        end
      end

      context 'when a project has alert_slack disabled' do
        before do
          create(:project_setting, project: project, key: 'alert_slack', value: 'false')
          create(:project_connector, :slack, project: project)
        end

        it 'does not deliver to the project' do
          expect(Slack::ProjectNotificationService).not_to receive(:deliver_alert)

          described_class.new.perform(organization.id)
        end
      end

      context 'when no project has alert_slack enabled' do
        it 'does not deliver to any project Slack webhook' do
          expect(Slack::ProjectNotificationService).not_to receive(:deliver_alert)

          described_class.new.perform(organization.id)
        end
      end
    end

    it 'returns stats summary' do
      stats = described_class.new.perform(organization.id)

      expect(stats).to have_key(:organizations_checked)
      expect(stats).to have_key(:alerts_sent)
      expect(stats).to have_key(:errors)
    end
  end
end

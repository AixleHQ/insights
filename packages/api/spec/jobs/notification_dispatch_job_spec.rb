# frozen_string_literal: true

require 'rails_helper'

RSpec.describe NotificationDispatchJob, type: :job do
  let(:organization) { create(:organization) }
  let(:owner)        { create(:user) }
  let(:member)       { create(:user) }
  let(:alert_data)   { { "type" => "cost_threshold", "severity" => "warning", "current_cost_usd" => 150.0 } }

  before do
    create(:organization_membership, user: owner, organization: organization, role: "owner")
    create(:organization_membership, user: member, organization: organization, role: "member")
    allow(Slack::NotificationService).to receive(:deliver_alert)
  end

  describe '#perform' do
    context 'with role-type routes' do
      before do
        create(:notification_route, organization: organization,
               notification_type: "cost_alert", recipient_type: "role", recipient_role: "owner")
      end

      it 'creates a Notification row for each member with that role' do
        expect {
          described_class.new.perform(organization.id, "cost_alert", alert_data)
        }.to change(Notification, :count).by(1)

        notification = Notification.last
        expect(notification.user).to eq(owner)
        expect(notification.notification_type).to eq("cost_alert")
      end

      it 'resolves multiple members with the role' do
        second_owner = create(:user)
        create(:organization_membership, user: second_owner, organization: organization, role: "owner")

        expect {
          described_class.new.perform(organization.id, "cost_alert", alert_data)
        }.to change(Notification, :count).by(2)
      end
    end

    context 'with user-type routes' do
      before do
        create(:notification_route, organization: organization,
               notification_type: "cost_alert", recipient_type: "user",
               recipient_role: nil, recipient_user_id: member.id)
      end

      it 'creates a Notification row for the specific user' do
        expect {
          described_class.new.perform(organization.id, "cost_alert", alert_data)
        }.to change(Notification, :count).by(1)

        expect(Notification.last.user).to eq(member)
      end
    end

    context 'with overlapping routes' do
      it 'deduplicates recipients appearing in multiple routes' do
        create(:notification_route, organization: organization,
               notification_type: "cost_alert", recipient_type: "role", recipient_role: "owner")
        create(:notification_route, organization: organization,
               notification_type: "cost_alert", recipient_type: "user",
               recipient_role: nil, recipient_user_id: owner.id)

        expect {
          described_class.new.perform(organization.id, "cost_alert", alert_data)
        }.to change(Notification, :count).by(1)
      end
    end

    context 'with per-user opt-out' do
      before do
        create(:notification_route, organization: organization,
               notification_type: "cost_alert", recipient_type: "role", recipient_role: "owner")
      end

      it 'skips users with both alert_slack and alert_email disabled' do
        create(:user_personal_settings, user: owner, alert_slack: false, alert_email: false)

        expect {
          described_class.new.perform(organization.id, "cost_alert", alert_data)
        }.not_to change(Notification, :count)

        # Org-level Slack webhook fires regardless of per-user opt-outs
        expect(Slack::NotificationService).to have_received(:deliver_alert).once
      end

      it 'does not skip users with at least one channel enabled' do
        create(:user_personal_settings, user: owner, alert_slack: false, alert_email: true)

        expect {
          described_class.new.perform(organization.id, "cost_alert", alert_data)
        }.to change(Notification, :count).by(1)
      end

      it 'does not skip users with no user_personal_settings record' do
        expect {
          described_class.new.perform(organization.id, "cost_alert", alert_data)
        }.to change(Notification, :count).by(1)
      end
    end

    context 'with a disabled route' do
      it 'ignores disabled routes while still processing enabled ones' do
        create(:notification_route, organization: organization,
               notification_type: "cost_alert", recipient_type: "role", recipient_role: "owner",
               enabled: true)
        create(:notification_route, organization: organization,
               notification_type: "cost_alert", recipient_type: "role", recipient_role: "member",
               enabled: false)

        expect {
          described_class.new.perform(organization.id, "cost_alert", alert_data)
        }.to change(Notification, :count).by(1)

        expect(Notification.last.user).to eq(owner)
      end
    end

    context 'with no matching routes' do
      it 'returns early without creating Notifications or calling Slack' do
        expect(Slack::NotificationService).not_to receive(:deliver_alert)

        expect {
          described_class.new.perform(organization.id, "cost_alert", alert_data)
        }.not_to change(Notification, :count)
      end
    end

    it 'calls Slack::NotificationService.deliver_alert exactly once' do
      create(:notification_route, organization: organization,
             notification_type: "cost_alert", recipient_type: "role", recipient_role: "owner")
      create(:notification_route, organization: organization,
             notification_type: "cost_alert", recipient_type: "role", recipient_role: "member")

      described_class.new.perform(organization.id, "cost_alert", alert_data)

      expect(Slack::NotificationService).to have_received(:deliver_alert).once
    end

    it 'logs and does not raise on RecordNotFound' do
      allow(Organization).to receive(:find).and_raise(ActiveRecord::RecordNotFound.new("not found"))

      expect {
        described_class.new.perform(SecureRandom.uuid, "cost_alert", alert_data)
      }.not_to raise_error
    end
  end
end

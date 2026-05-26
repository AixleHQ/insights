require 'rails_helper'

RSpec.describe AdminAuditLog, type: :model do
  describe 'associations' do
    it { should belong_to(:admin_user).class_name('User') }
  end

  describe 'validations' do
    subject { build(:admin_audit_log) }

    it { should validate_presence_of(:action) }
    it { should validate_presence_of(:resource_type) }
  end

  describe 'scopes' do
    describe '.by_admin' do
      it 'returns logs for the specified admin' do
        admin = create(:user, :global_admin)
        other_admin = create(:user, :global_admin)
        admin_log = create(:admin_audit_log, admin_user: admin)
        other_log = create(:admin_audit_log, admin_user: other_admin)

        expect(AdminAuditLog.by_admin(admin)).to include(admin_log)
        expect(AdminAuditLog.by_admin(admin)).not_to include(other_log)
      end
    end

    describe '.by_resource' do
      it 'returns logs for the specified resource type' do
        org_log = create(:admin_audit_log, resource_type: 'Organization')
        user_log = create(:admin_audit_log, resource_type: 'User')

        expect(AdminAuditLog.by_resource('Organization')).to include(org_log)
        expect(AdminAuditLog.by_resource('Organization')).not_to include(user_log)
      end

      it 'returns logs for the specified resource type and id' do
        resource_id = SecureRandom.uuid
        matching_log = create(:admin_audit_log, resource_type: 'Organization', resource_id: resource_id)
        other_log = create(:admin_audit_log, resource_type: 'Organization', resource_id: SecureRandom.uuid)

        expect(AdminAuditLog.by_resource('Organization', resource_id)).to include(matching_log)
        expect(AdminAuditLog.by_resource('Organization', resource_id)).not_to include(other_log)
      end
    end

    describe '.recent' do
      it 'returns logs ordered by created_at descending' do
        old_log = create(:admin_audit_log, created_at: 1.week.ago)
        new_log = create(:admin_audit_log, created_at: 1.day.ago)

        expect(AdminAuditLog.recent.first).to eq(new_log)
        expect(AdminAuditLog.recent.last).to eq(old_log)
      end
    end
  end

  describe '.log_action' do
    let(:admin) { create(:user, :global_admin) }
    let(:organization) { create(:organization) }

    it 'creates an audit log with the provided parameters' do
      expect {
        AdminAuditLog.log_action(
          admin_user: admin,
          action: 'organizations#update',
          resource: organization,
          tracked_changes: { name: [ 'Old', 'New' ] },
          metadata: { reason: 'Test' }
        )
      }.to change(AdminAuditLog, :count).by(1)

      log = AdminAuditLog.last
      expect(log.admin_user).to eq(admin)
      expect(log.action).to eq('organizations#update')
      expect(log.resource_type).to eq('Organization')
      expect(log.resource_id).to eq(organization.id)
      expect(log.tracked_changes).to eq('name' => [ 'Old', 'New' ])
      expect(log.metadata).to eq('reason' => 'Test')
    end

    it 'defaults severity to info and outcome to success' do
      AdminAuditLog.log_action(
        admin_user: admin,
        action: 'organizations#update',
        resource: organization
      )

      log = AdminAuditLog.last
      expect(log.severity).to eq('info')
      expect(log.outcome).to eq('success')
    end

    it 'persists explicit severity and outcome when provided' do
      AdminAuditLog.log_action(
        admin_user: admin,
        action: 'organizations#update',
        resource: organization,
        severity: 'critical',
        outcome: 'failure'
      )

      log = AdminAuditLog.last
      expect(log.severity).to eq('critical')
      expect(log.outcome).to eq('failure')
    end

    it 'captures request information when provided' do
      request = double('request', remote_ip: '192.168.1.1', user_agent: 'Mozilla/5.0')

      AdminAuditLog.log_action(
        admin_user: admin,
        action: 'organizations#update',
        resource: organization,
        request: request
      )

      log = AdminAuditLog.last
      expect(log.ip_address.to_s).to eq('192.168.1.1')
      expect(log.user_agent).to eq('Mozilla/5.0')
    end

    it 'handles nil request gracefully' do
      AdminAuditLog.log_action(
        admin_user: admin,
        action: 'organizations#update',
        resource: organization,
        request: nil
      )

      log = AdminAuditLog.last
      expect(log.ip_address).to be_nil
      expect(log.user_agent).to be_nil
    end
  end
end

require 'rails_helper'

RSpec.describe ApplicationPolicy, type: :policy do
  let(:user)         { create(:user) }
  let(:organization) { create(:organization) }

  def policy(current_user:, org: nil)
    described_class.new(nil, user: current_user, organization: org)
  end

  describe '#org_alert_policy' do
    it 'returns the org retention_policy' do
      p = policy(current_user: user, org: organization)
      expect(p.org_alert_policy).to eq(organization.retention_policy)
    end

    it 'returns nil when org is nil' do
      p = policy(current_user: user, org: nil)
      expect(p.org_alert_policy).to be_nil
    end
  end

  describe '#project_alert_policy' do
    let(:project) { create(:project, organization: organization) }

    it 'returns the project retention_policy' do
      p = policy(current_user: user, org: organization)
      expect(p.project_alert_policy(project)).to eq(project.retention_policy)
    end

    it 'returns nil when project is nil' do
      p = policy(current_user: user)
      expect(p.project_alert_policy(nil)).to be_nil
    end
  end

  describe '#personal_alert_setting' do
    it 'returns the user personal_setting' do
      settings = create(:user_personal_settings, user: user)
      p = policy(current_user: user)
      expect(p.personal_alert_setting).to eq(settings)
    end

    it 'returns nil when user is nil' do
      p = policy(current_user: nil)
      expect(p.personal_alert_setting).to be_nil
    end
  end
end

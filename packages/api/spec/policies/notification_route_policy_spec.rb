# frozen_string_literal: true

require 'rails_helper'

RSpec.describe NotificationRoutePolicy, type: :policy do
  let(:owner)        { create(:user) }
  let(:member)       { create(:user) }
  let(:global_admin) { create(:user, :global_admin) }
  let(:organization) { create(:organization) }

  let!(:owner_membership)  { create(:organization_membership, user: owner, organization: organization, role: 'owner') }
  let!(:member_membership) { create(:organization_membership, user: member, organization: organization, role: 'member') }
  # global_admin is intentionally NOT a member — isolates global_admin? from org_admin?

  let(:route) do
    build(:notification_route, organization: organization,
          notification_type: 'cost_alert', recipient_type: 'role', recipient_role: 'owner')
  end

  def policy(record, current_user:)
    described_class.new(record, user: current_user, organization: organization)
  end

  describe '#index?' do
    it 'allows org owner' do
      expect(policy(organization, current_user: owner).apply(:index?)).to be true
    end

    it 'denies member' do
      expect(policy(organization, current_user: member).apply(:index?)).to be false
    end

    it 'allows global_admin who is not a member' do
      expect(policy(organization, current_user: global_admin).apply(:index?)).to be true
    end
  end

  describe '#create?' do
    it 'allows org owner' do
      expect(policy(route, current_user: owner).apply(:create?)).to be true
    end

    it 'denies member' do
      expect(policy(route, current_user: member).apply(:create?)).to be false
    end

    it 'allows global_admin who is not a member' do
      expect(policy(route, current_user: global_admin).apply(:create?)).to be true
    end
  end

  describe '#update?' do
    it 'allows org owner' do
      expect(policy(route, current_user: owner).apply(:update?)).to be true
    end

    it 'denies member' do
      expect(policy(route, current_user: member).apply(:update?)).to be false
    end

    it 'allows global_admin who is not a member' do
      expect(policy(route, current_user: global_admin).apply(:update?)).to be true
    end
  end

  describe '#destroy?' do
    it 'allows org owner' do
      expect(policy(route, current_user: owner).apply(:destroy?)).to be true
    end

    it 'denies member' do
      expect(policy(route, current_user: member).apply(:destroy?)).to be false
    end

    it 'allows global_admin who is not a member' do
      expect(policy(route, current_user: global_admin).apply(:destroy?)).to be true
    end
  end
end

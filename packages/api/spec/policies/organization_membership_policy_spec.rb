# frozen_string_literal: true

require 'rails_helper'

RSpec.describe OrganizationMembershipPolicy, type: :policy do
  let(:owner) { create(:user) }
  let(:admin) { create(:user) }
  let(:member) { create(:user) }
  let(:non_member) { create(:user) }
  let(:global_admin) { create(:user, :global_admin) }
  let(:organization) { create(:organization) }
  let!(:owner_membership) { create(:organization_membership, user: owner, organization: organization, role: 'owner') }
  let!(:admin_membership) { create(:organization_membership, user: admin, organization: organization, role: 'owner') }
  let!(:member_membership) { create(:organization_membership, user: member, organization: organization, role: 'member') }

  def policy(record, current_user:, org: nil)
    described_class.new(record, user: current_user, organization: org || record&.organization)
  end

  describe '#index?' do
    it 'allows members to list memberships' do
      expect(policy(member_membership, current_user: member).apply(:index?)).to be true
    end

    it 'denies non-members' do
      expect(policy(member_membership, current_user: non_member).apply(:index?)).to be false
    end
  end

  describe '#create?' do
    let(:new_membership) { organization.organization_memberships.new(role: 'member') }

    it 'allows admins to add members' do
      expect(policy(new_membership, current_user: admin).apply(:create?)).to be true
    end

    it 'denies regular members' do
      expect(policy(new_membership, current_user: member).apply(:create?)).to be false
    end
  end

  describe '#update?' do
    it 'allows admins to update non-owner memberships' do
      expect(policy(member_membership, current_user: admin).apply(:update?)).to be true
    end

    it 'denies members from updating any memberships' do
      expect(policy(member_membership, current_user: member).apply(:update?)).to be false
    end

    it 'allows owners to update owner memberships' do
      other_owner = create(:user)
      other_owner_membership = create(:organization_membership, user: other_owner, organization: organization, role: 'owner')

      expect(policy(other_owner_membership, current_user: owner).apply(:update?)).to be true
    end

    it 'allows global admins' do
      expect(policy(owner_membership, current_user: global_admin).apply(:update?)).to be true
    end
  end

  describe '#destroy?' do
    it 'allows admins to remove non-owner members' do
      expect(policy(member_membership, current_user: admin).apply(:destroy?)).to be true
    end

    it 'denies members from removing any members' do
      expect(policy(member_membership, current_user: member).apply(:destroy?)).to be false
    end

    it 'allows owners to remove other owners' do
      other_owner = create(:user)
      other_owner_membership = create(:organization_membership, user: other_owner, organization: organization, role: 'owner')

      expect(policy(other_owner_membership, current_user: owner).apply(:destroy?)).to be true
    end
  end

  describe '#dashboard_stats?' do
    it 'allows a member to view their own dashboard stats' do
      expect(policy(member_membership, current_user: member).apply(:dashboard_stats?)).to be true
    end

    it 'denies a member from viewing another member dashboard stats' do
      other_member = create(:user)
      other_membership = create(:organization_membership, user: other_member, organization: organization, role: 'member')

      expect(policy(member_membership, current_user: other_member).apply(:dashboard_stats?)).to be false
      expect(policy(other_membership, current_user: member).apply(:dashboard_stats?)).to be false
    end

    it 'allows an owner to view any member dashboard stats' do
      expect(policy(member_membership, current_user: owner).apply(:dashboard_stats?)).to be true
    end

    it 'allows a global admin to view any member dashboard stats' do
      expect(policy(member_membership, current_user: global_admin).apply(:dashboard_stats?)).to be true
    end

    it 'denies a non-member' do
      expect(policy(member_membership, current_user: non_member).apply(:dashboard_stats?)).to be false
    end
  end

  describe '#member_heatmap?' do
    it 'delegates to dashboard_stats? — member can view own, denied for another member' do
      other_member = create(:user)
      create(:organization_membership, user: other_member, organization: organization, role: 'member')

      expect(policy(member_membership, current_user: member).apply(:member_heatmap?)).to be true
      expect(policy(member_membership, current_user: other_member).apply(:member_heatmap?)).to be false
      expect(policy(member_membership, current_user: owner).apply(:member_heatmap?)).to be true
    end
  end

  describe '#prompt_insights?' do
    it 'delegates to dashboard_stats? — member can view own, denied for another member' do
      other_member = create(:user)
      create(:organization_membership, user: other_member, organization: organization, role: 'member')

      expect(policy(member_membership, current_user: member).apply(:prompt_insights?)).to be true
      expect(policy(member_membership, current_user: other_member).apply(:prompt_insights?)).to be false
      expect(policy(member_membership, current_user: owner).apply(:prompt_insights?)).to be true
    end
  end
end

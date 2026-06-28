# frozen_string_literal: true

require 'rails_helper'

RSpec.describe OrganizationRetentionPolicyPolicy, type: :policy do
  let(:owner)        { create(:user) }
  let(:member)       { create(:user) }
  let(:viewer)       { create(:user) }
  let(:global_admin) { create(:user, :global_admin) }
  let(:organization) { create(:organization) }
  let(:org_policy)   { build(:organization_retention_policy, organization: organization) }

  before do
    create(:organization_membership, user: owner,  organization: organization, role: 'owner')
    create(:organization_membership, user: member, organization: organization, role: 'member')
    create(:organization_membership, user: viewer, organization: organization, role: 'viewer')
    # global_admin intentionally NOT a member — isolates global_admin? from org_admin?
  end

  def policy(record, current_user:)
    described_class.new(record, user: current_user, organization: organization)
  end

  describe '#show?' do
    it 'allows org owner' do
      expect(policy(org_policy, current_user: owner).apply(:show?)).to be true
    end

    it 'denies member' do
      expect(policy(org_policy, current_user: member).apply(:show?)).to be false
    end

    it 'denies viewer' do
      expect(policy(org_policy, current_user: viewer).apply(:show?)).to be false
    end

    it 'allows global_admin who is not a member' do
      expect(policy(org_policy, current_user: global_admin).apply(:show?)).to be true
    end
  end

  describe '#create?' do
    it 'allows org owner' do
      expect(policy(org_policy, current_user: owner).apply(:create?)).to be true
    end

    it 'denies member' do
      expect(policy(org_policy, current_user: member).apply(:create?)).to be false
    end

    it 'denies viewer' do
      expect(policy(org_policy, current_user: viewer).apply(:create?)).to be false
    end

    it 'allows global_admin who is not a member' do
      expect(policy(org_policy, current_user: global_admin).apply(:create?)).to be true
    end
  end

  describe '#update?' do
    it 'allows org owner' do
      expect(policy(org_policy, current_user: owner).apply(:update?)).to be true
    end

    it 'denies member' do
      expect(policy(org_policy, current_user: member).apply(:update?)).to be false
    end

    it 'denies viewer' do
      expect(policy(org_policy, current_user: viewer).apply(:update?)).to be false
    end

    it 'allows global_admin who is not a member' do
      expect(policy(org_policy, current_user: global_admin).apply(:update?)).to be true
    end
  end

  describe '#destroy?' do
    it 'allows org owner' do
      expect(policy(org_policy, current_user: owner).apply(:destroy?)).to be true
    end

    it 'denies member' do
      expect(policy(org_policy, current_user: member).apply(:destroy?)).to be false
    end

    it 'denies viewer' do
      expect(policy(org_policy, current_user: viewer).apply(:destroy?)).to be false
    end

    it 'allows global_admin who is not a member' do
      expect(policy(org_policy, current_user: global_admin).apply(:destroy?)).to be true
    end
  end
end

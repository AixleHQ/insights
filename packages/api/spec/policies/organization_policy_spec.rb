# frozen_string_literal: true

require 'rails_helper'

RSpec.describe OrganizationPolicy, type: :policy do
  let(:owner) { create(:user) }
  let(:admin) { create(:user) }
  let(:member) { create(:user) }
  let(:non_member) { create(:user) }
  let(:global_admin) { create(:user, :global_admin) }
  let(:organization) { create(:organization) }

  before do
    create(:organization_membership, user: owner, organization: organization, role: 'owner')
    create(:organization_membership, user: admin, organization: organization, role: 'owner')
    create(:organization_membership, user: member, organization: organization, role: 'member')
  end

  def policy(record, current_user:, org: nil)
    described_class.new(record, user: current_user, organization: org)
  end

  describe '#show?' do
    it 'allows members to view' do
      expect(policy(organization, current_user: member).apply(:show?)).to be true
    end

    it 'denies non-members' do
      expect(policy(organization, current_user: non_member).apply(:show?)).to be false
    end

    it 'allows global admins' do
      expect(policy(organization, current_user: global_admin).apply(:show?)).to be true
    end
  end

  describe '#update?' do
    it 'allows admins to update' do
      expect(policy(organization, current_user: admin).apply(:update?)).to be true
    end

    it 'denies regular members' do
      expect(policy(organization, current_user: member).apply(:update?)).to be false
    end

    it 'allows global admins' do
      expect(policy(organization, current_user: global_admin).apply(:update?)).to be true
    end
  end

  describe '#destroy?' do
    it 'allows owners to destroy' do
      expect(policy(organization, current_user: owner).apply(:destroy?)).to be true
    end

    it 'denies members' do
      expect(policy(organization, current_user: member).apply(:destroy?)).to be false
    end

    it 'allows global admins' do
      expect(policy(organization, current_user: global_admin).apply(:destroy?)).to be true
    end
  end

  describe '#create?' do
    it 'allows any authenticated user' do
      expect(policy(Organization.new, current_user: non_member).apply(:create?)).to be true
    end

    it 'denies unauthenticated users' do
      expect(policy(Organization.new, current_user: nil).apply(:create?)).to be false
    end
  end

  describe '#list_unattributed?' do
    it 'allows owners and admins' do
      expect(policy(organization, current_user: owner).apply(:list_unattributed?)).to be true
      expect(policy(organization, current_user: admin).apply(:list_unattributed?)).to be true
    end

    it 'denies regular members' do
      expect(policy(organization, current_user: member).apply(:list_unattributed?)).to be false
    end

    it 'allows global admins' do
      expect(policy(organization, current_user: global_admin).apply(:list_unattributed?)).to be true
    end
  end
end

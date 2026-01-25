require 'rails_helper'

RSpec.describe OrganizationMembership, type: :model do
  describe 'constants' do
    it 'defines valid roles' do
      expect(OrganizationMembership::ROLES).to eq(%w[owner admin member viewer])
    end
  end

  describe 'associations' do
    it { should belong_to(:user) }
    it { should belong_to(:organization) }
    it { should have_many(:user_tool_accounts).dependent(:destroy) }
  end

  describe 'validations' do
    subject { build(:organization_membership) }

    it { should validate_presence_of(:role) }
    it { should validate_inclusion_of(:role).in_array(OrganizationMembership::ROLES) }

    it 'validates uniqueness of user per organization' do
      membership = create(:organization_membership)
      duplicate = build(:organization_membership, user: membership.user, organization: membership.organization)
      expect(duplicate).not_to be_valid
      expect(duplicate.errors[:user_id]).to include('is already a member of this organization')
    end
  end

  describe 'scopes' do
    let(:organization) { create(:organization) }

    describe '.owners' do
      it 'returns only owner memberships' do
        owner_membership = create(:organization_membership, organization: organization, role: 'owner')
        admin_membership = create(:organization_membership, organization: organization, role: 'admin')

        expect(OrganizationMembership.owners).to include(owner_membership)
        expect(OrganizationMembership.owners).not_to include(admin_membership)
      end
    end

    describe '.admins' do
      it 'returns owner and admin memberships' do
        owner_membership = create(:organization_membership, organization: organization, role: 'owner')
        admin_membership = create(:organization_membership, organization: organization, role: 'admin')
        member_membership = create(:organization_membership, organization: organization, role: 'member')

        expect(OrganizationMembership.admins).to include(owner_membership)
        expect(OrganizationMembership.admins).to include(admin_membership)
        expect(OrganizationMembership.admins).not_to include(member_membership)
      end
    end
  end

  describe '#owner?' do
    it 'returns true for owner role' do
      membership = build(:organization_membership, role: 'owner')
      expect(membership.owner?).to be true
    end

    it 'returns false for non-owner role' do
      membership = build(:organization_membership, role: 'admin')
      expect(membership.owner?).to be false
    end
  end

  describe '#admin?' do
    it 'returns true for owner role' do
      membership = build(:organization_membership, role: 'owner')
      expect(membership.admin?).to be true
    end

    it 'returns true for admin role' do
      membership = build(:organization_membership, role: 'admin')
      expect(membership.admin?).to be true
    end

    it 'returns false for member role' do
      membership = build(:organization_membership, role: 'member')
      expect(membership.admin?).to be false
    end
  end

  describe '#can_manage_members?' do
    it 'returns true for admins' do
      membership = build(:organization_membership, role: 'admin')
      expect(membership.can_manage_members?).to be true
    end

    it 'returns false for members' do
      membership = build(:organization_membership, role: 'member')
      expect(membership.can_manage_members?).to be false
    end
  end

  describe '#can_manage_projects?' do
    it 'returns true for owner' do
      membership = build(:organization_membership, role: 'owner')
      expect(membership.can_manage_projects?).to be true
    end

    it 'returns true for admin' do
      membership = build(:organization_membership, role: 'admin')
      expect(membership.can_manage_projects?).to be true
    end

    it 'returns true for member' do
      membership = build(:organization_membership, role: 'member')
      expect(membership.can_manage_projects?).to be true
    end

    it 'returns false for viewer' do
      membership = build(:organization_membership, role: 'viewer')
      expect(membership.can_manage_projects?).to be false
    end
  end
end

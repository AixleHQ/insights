require 'rails_helper'

RSpec.describe OrganizationMembership, type: :model do
  describe 'constants' do
    it 'defines valid roles' do
      expect(OrganizationMembership::ROLES).to eq(%w[owner member viewer])
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

    describe 'last owner protection on role downgrade' do
      let(:organization) { create(:organization) }

      it 'prevents downgrading the last owner' do
        owner_membership = create(:organization_membership, organization: organization, role: 'owner')
        owner_membership.role = 'member'
        expect(owner_membership).not_to be_valid
        expect(owner_membership.errors[:role]).to include('Cannot downgrade the last owner of an organization')
      end

      it 'allows downgrading an owner when another owner exists' do
        owner_membership = create(:organization_membership, organization: organization, role: 'owner')
        create(:organization_membership, organization: organization, role: 'owner')
        owner_membership.role = 'member'
        expect(owner_membership).to be_valid
      end
    end
  end

  describe 'last owner protection on destroy' do
    let(:organization) { create(:organization) }

    it 'prevents destroying the last owner membership' do
      owner_membership = create(:organization_membership, organization: organization, role: 'owner')
      expect(owner_membership.destroy).to be_falsey
      expect(owner_membership.errors[:base]).to include('Cannot remove the last owner of an organization')
      expect(OrganizationMembership.exists?(owner_membership.id)).to be true
    end

    it 'allows destroying an owner membership when another owner exists' do
      owner_membership = create(:organization_membership, organization: organization, role: 'owner')
      create(:organization_membership, organization: organization, role: 'owner')
      expect(owner_membership.destroy).to be_truthy
      expect(OrganizationMembership.exists?(owner_membership.id)).to be false
    end

    it 'allows destroying a non-owner membership regardless' do
      create(:organization_membership, organization: organization, role: 'owner')
      member_membership = create(:organization_membership, organization: organization, role: 'member')
      expect(member_membership.destroy).to be_truthy
    end
  end

  describe 'project membership cascade on destroy (AIX-611)' do
    let(:organization) { create(:organization) }
    let(:user) { create(:user) }

    it 'removes the user\'s project memberships on the org\'s projects' do
      create(:organization_membership, organization: organization, role: 'owner')
      membership = create(:organization_membership, user: user, organization: organization, role: 'member')
      project = create(:project, organization: organization, owner: nil)
      create(:project_membership, user: user, project: project, role: 'member')

      expect { membership.destroy }.to change {
        ProjectMembership.where(user: user, project: project).count
      }.from(1).to(0)
    end

    it 'leaves the user\'s project memberships on other orgs untouched' do
      create(:organization_membership, organization: organization, role: 'owner')
      membership = create(:organization_membership, user: user, organization: organization, role: 'member')

      other_org = create(:organization)
      create(:organization_membership, user: user, organization: other_org, role: 'member')
      other_project = create(:project, organization: other_org, owner: nil)
      other_pm = create(:project_membership, user: user, project: other_project, role: 'member')

      membership.destroy
      expect(ProjectMembership.exists?(other_pm.id)).to be true
    end
  end

  describe 'scopes' do
    let(:organization) { create(:organization) }

    describe '.owners' do
      it 'returns only owner memberships' do
        owner_membership = create(:organization_membership, organization: organization, role: 'owner')
        member_membership = create(:organization_membership, organization: organization, role: 'member')

        expect(OrganizationMembership.owners).to include(owner_membership)
        expect(OrganizationMembership.owners).not_to include(member_membership)
      end
    end

    describe '.admins' do
      it 'returns only owner memberships (post-AIX-201: admin role removed)' do
        owner_membership = create(:organization_membership, organization: organization, role: 'owner')
        member_membership = create(:organization_membership, organization: organization, role: 'member')
        viewer_membership = create(:organization_membership, organization: organization, role: 'viewer')

        expect(OrganizationMembership.admins).to include(owner_membership)
        expect(OrganizationMembership.admins).not_to include(member_membership)
        expect(OrganizationMembership.admins).not_to include(viewer_membership)
      end
    end
  end

  describe '#owner?' do
    it 'returns true for owner role' do
      membership = build(:organization_membership, role: 'owner')
      expect(membership.owner?).to be true
    end

    it 'returns false for non-owner role' do
      membership = build(:organization_membership, role: 'member')
      expect(membership.owner?).to be false
    end
  end

  describe '#admin?' do
    it 'returns true for owner role' do
      membership = build(:organization_membership, role: 'owner')
      expect(membership.admin?).to be true
    end

    it 'returns false for member role' do
      membership = build(:organization_membership, role: 'member')
      expect(membership.admin?).to be false
    end

    it 'returns false for viewer role' do
      membership = build(:organization_membership, role: 'viewer')
      expect(membership.admin?).to be false
    end
  end

  describe '#can_manage_projects?' do
    it 'returns true for owner' do
      membership = build(:organization_membership, role: 'owner')
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

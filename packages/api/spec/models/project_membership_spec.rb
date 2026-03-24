require 'rails_helper'

RSpec.describe ProjectMembership, type: :model do
  describe 'constants' do
    it 'defines valid roles' do
      expect(ProjectMembership::ROLES).to eq(%w[owner admin member viewer])
    end
  end

  describe 'associations' do
    it { should belong_to(:user) }
    it { should belong_to(:project) }
  end

  describe 'validations' do
    subject { build(:project_membership) }

    it { should validate_presence_of(:role) }
    it { should validate_inclusion_of(:role).in_array(ProjectMembership::ROLES) }

    it 'validates uniqueness of user per project' do
      membership = create(:project_membership)
      duplicate = build(:project_membership, user: membership.user, project: membership.project)
      expect(duplicate).not_to be_valid
      expect(duplicate.errors[:user_id]).to include('is already a member of this project')
    end

    describe 'last owner protection on role downgrade' do
      let(:project) { create(:project) }

      it 'prevents downgrading the last owner' do
        owner_membership = create(:project_membership, project: project, role: 'owner')
        owner_membership.role = 'admin'
        expect(owner_membership).not_to be_valid
        expect(owner_membership.errors[:role]).to include('Cannot downgrade the last owner of a project')
      end

      it 'allows downgrading an owner when another owner exists' do
        owner_membership = create(:project_membership, project: project, role: 'owner')
        create(:project_membership, project: project, role: 'owner')
        owner_membership.role = 'admin'
        expect(owner_membership).to be_valid
      end
    end
  end

  describe 'last owner protection on destroy' do
    let(:project) { create(:project) }

    it 'prevents destroying the last owner membership' do
      owner_membership = create(:project_membership, project: project, role: 'owner')
      expect(owner_membership.destroy).to be_falsey
      expect(owner_membership.errors[:base]).to include('Cannot remove the last owner of a project')
      expect(ProjectMembership.exists?(owner_membership.id)).to be true
    end

    it 'allows destroying an owner membership when another owner exists' do
      owner_membership = create(:project_membership, project: project, role: 'owner')
      create(:project_membership, project: project, role: 'owner')
      expect(owner_membership.destroy).to be_truthy
      expect(ProjectMembership.exists?(owner_membership.id)).to be false
    end

    it 'allows destroying a non-owner membership regardless' do
      create(:project_membership, project: project, role: 'owner')
      member_membership = create(:project_membership, project: project, role: 'member')
      expect(member_membership.destroy).to be_truthy
    end

    it 'allows cascaded destroy when project itself is being destroyed' do
      owner_membership = create(:project_membership, project: project, role: 'owner')
      expect { project.destroy! }.not_to raise_error
      expect(ProjectMembership.exists?(owner_membership.id)).to be false
    end
  end

  describe 'scopes' do
    let(:project) { create(:project) }

    describe '.owners' do
      it 'returns only owner memberships' do
        owner_membership = create(:project_membership, project: project, role: 'owner')
        admin_membership = create(:project_membership, project: project, role: 'admin')

        expect(ProjectMembership.owners).to include(owner_membership)
        expect(ProjectMembership.owners).not_to include(admin_membership)
      end
    end

    describe '.admins' do
      it 'returns owner and admin memberships' do
        owner_membership = create(:project_membership, project: project, role: 'owner')
        admin_membership = create(:project_membership, project: project, role: 'admin')
        member_membership = create(:project_membership, project: project, role: 'member')

        expect(ProjectMembership.admins).to include(owner_membership)
        expect(ProjectMembership.admins).to include(admin_membership)
        expect(ProjectMembership.admins).not_to include(member_membership)
      end
    end
  end

  describe '#owner?' do
    it 'returns true for owner role' do
      membership = build(:project_membership, role: 'owner')
      expect(membership.owner?).to be true
    end

    it 'returns false for non-owner role' do
      membership = build(:project_membership, role: 'admin')
      expect(membership.owner?).to be false
    end
  end

  describe '#admin?' do
    it 'returns true for owner role' do
      membership = build(:project_membership, role: 'owner')
      expect(membership.admin?).to be true
    end

    it 'returns true for admin role' do
      membership = build(:project_membership, role: 'admin')
      expect(membership.admin?).to be true
    end

    it 'returns false for member role' do
      membership = build(:project_membership, role: 'member')
      expect(membership.admin?).to be false
    end
  end

  describe '#can_edit?' do
    it 'returns true for owner' do
      membership = build(:project_membership, role: 'owner')
      expect(membership.can_edit?).to be true
    end

    it 'returns true for admin' do
      membership = build(:project_membership, role: 'admin')
      expect(membership.can_edit?).to be true
    end

    it 'returns true for member' do
      membership = build(:project_membership, role: 'member')
      expect(membership.can_edit?).to be true
    end

    it 'returns false for viewer' do
      membership = build(:project_membership, role: 'viewer')
      expect(membership.can_edit?).to be false
    end
  end
end

# frozen_string_literal: true

require 'rails_helper'

RSpec.describe ProjectMembershipPolicy, type: :policy do
  let(:user) { create(:user) }
  let(:other_user) { create(:user) }
  let(:global_admin) { create(:user, :global_admin) }
  let(:organization) { create(:organization) }
  let(:org_project) { create(:project, organization: organization, owner: nil) }
  let(:personal_project) { create(:project, owner: user, organization: nil) }

  before do
    create(:organization_membership, user: user, organization: organization)
    create(:organization_membership, user: other_user, organization: organization)
  end

  def policy(record, current_user:)
    described_class.new(record, user: current_user, organization: organization)
  end

  describe 'organization project memberships' do
    let!(:owner_membership) { create(:project_membership, user: user, project: org_project, role: 'owner') }
    let!(:member_membership) { create(:project_membership, user: other_user, project: org_project, role: 'member') }

    describe '#index?' do
      it 'allows org members to view' do
        expect(policy(owner_membership, current_user: user).apply(:index?)).to be true
      end

      it 'allows global admins' do
        expect(policy(owner_membership, current_user: global_admin).apply(:index?)).to be true
      end
    end

    describe '#show?' do
      it 'allows org members to view' do
        expect(policy(owner_membership, current_user: user).apply(:show?)).to be true
      end

      it 'allows global admins' do
        expect(policy(owner_membership, current_user: global_admin).apply(:show?)).to be true
      end
    end

    describe '#create?' do
      let(:new_member) { create(:user) }
      let(:new_membership) { ProjectMembership.new(user: new_member, project: org_project, role: 'member') }

      before do
        create(:organization_membership, user: new_member, organization: organization)
      end

      it 'allows project admins to add members' do
        expect(policy(new_membership, current_user: user).apply(:create?)).to be true
      end

      it 'denies non-admins' do
        expect(policy(new_membership, current_user: other_user).apply(:create?)).to be false
      end

      it 'allows global admins' do
        expect(policy(new_membership, current_user: global_admin).apply(:create?)).to be true
      end
    end

    describe '#update?' do
      it 'allows project admins to update regular members' do
        expect(policy(member_membership, current_user: user).apply(:update?)).to be true
      end

      it 'denies non-admins' do
        expect(policy(member_membership, current_user: other_user).apply(:update?)).to be false
      end

      it 'allows global admins' do
        expect(policy(member_membership, current_user: global_admin).apply(:update?)).to be true
      end
    end

    describe '#destroy?' do
      it 'allows project admins to remove regular members' do
        expect(policy(member_membership, current_user: user).apply(:destroy?)).to be true
      end

      it 'denies non-admins' do
        expect(policy(member_membership, current_user: other_user).apply(:destroy?)).to be false
      end

      it 'allows global admins' do
        expect(policy(member_membership, current_user: global_admin).apply(:destroy?)).to be true
      end
    end

    describe 'owner protection' do
      let(:admin_user) { create(:user) }
      let!(:admin_membership) { create(:project_membership, user: admin_user, project: org_project, role: 'admin') }

      before do
        create(:organization_membership, user: admin_user, organization: organization)
      end

      it 'prevents admins from demoting owners' do
        expect(policy(owner_membership, current_user: admin_user).apply(:update?)).to be false
      end

      it 'prevents admins from removing owners' do
        expect(policy(owner_membership, current_user: admin_user).apply(:destroy?)).to be false
      end

      it 'allows owners to demote other owners' do
        expect(policy(owner_membership, current_user: user).apply(:update?)).to be true
      end
    end
  end

  describe 'personal project memberships' do
    let!(:personal_membership) { create(:project_membership, user: other_user, project: personal_project, role: 'member') }

    describe '#index?' do
      it 'allows owner to view' do
        expect(policy(personal_membership, current_user: user).apply(:index?)).to be true
      end

      it 'denies non-owners' do
        non_owner = create(:user)
        expect(policy(personal_membership, current_user: non_owner).apply(:index?)).to be false
      end

      it 'allows global admins' do
        expect(policy(personal_membership, current_user: global_admin).apply(:index?)).to be true
      end
    end
  end
end

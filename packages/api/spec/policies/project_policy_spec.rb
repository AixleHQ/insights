# frozen_string_literal: true

require 'rails_helper'

RSpec.describe ProjectPolicy, type: :policy do
  let(:user) { create(:user) }
  let(:other_user) { create(:user) }
  let(:global_admin) { create(:user, :global_admin) }
  let(:organization) { create(:organization) }

  before do
    create(:organization_membership, user: user, organization: organization)
  end

  def policy(record, current_user:, org: nil)
    described_class.new(record, user: current_user, organization: org)
  end

  describe 'personal projects' do
    let(:personal_project) { create(:project, owner: user, organization: nil) }
    let(:other_personal_project) { create(:project, owner: other_user, organization: nil) }

    describe '#show?' do
      it 'allows owner to view' do
        expect(policy(personal_project, current_user: user).apply(:show?)).to be true
      end

      it 'denies non-owners' do
        expect(policy(personal_project, current_user: other_user).apply(:show?)).to be false
      end

      it 'allows global admins' do
        expect(policy(personal_project, current_user: global_admin).apply(:show?)).to be true
      end
    end

    describe '#update?' do
      it 'allows owner to update' do
        expect(policy(personal_project, current_user: user).apply(:update?)).to be true
      end

      it 'denies non-owners' do
        expect(policy(personal_project, current_user: other_user).apply(:update?)).to be false
      end
    end

    describe '#destroy?' do
      it 'allows owner to destroy' do
        expect(policy(personal_project, current_user: user).apply(:destroy?)).to be true
      end

      it 'denies non-owners' do
        expect(policy(personal_project, current_user: other_user).apply(:destroy?)).to be false
      end
    end
  end

  describe 'organization projects' do
    let(:org_project) { create(:project, organization: organization, owner: nil) }
    let!(:project_membership) { create(:project_membership, user: user, project: org_project, role: "owner") }

    describe '#show?' do
      it 'allows users with an explicit project membership to view' do
        expect(policy(org_project, current_user: user).apply(:show?)).to be true
      end

      it 'denies non-members' do
        expect(policy(org_project, current_user: other_user).apply(:show?)).to be false
      end

      it 'denies an org member who has no explicit project membership (AIX-381)' do
        bare_member = create(:user)
        create(:organization_membership, user: bare_member, organization: organization, role: 'member')

        expect(policy(org_project, current_user: bare_member).apply(:show?)).to be false
      end

      it 'allows an org owner without a project membership row (implicit owner)' do
        org_owner = create(:user)
        create(:organization_membership, user: org_owner, organization: organization, role: 'owner')

        expect(policy(org_project, current_user: org_owner).apply(:show?)).to be true
      end
    end

    describe '#update?' do
      it 'allows project admins to update' do
        expect(policy(org_project, current_user: user).apply(:update?)).to be true
      end

      it 'denies non-admins' do
        viewer = create(:user)
        create(:organization_membership, user: viewer, organization: organization)
        create(:project_membership, user: viewer, project: org_project, role: 'viewer')

        expect(policy(org_project, current_user: viewer).apply(:update?)).to be false
      end
    end

    describe '#destroy?' do
      it 'allows project owners to destroy' do
        project_membership.update!(role: 'owner')
        expect(policy(org_project, current_user: user).apply(:destroy?)).to be true
      end

      it 'denies project members who are not org owners from destroying' do
        member_actor = create(:user)
        create(:organization_membership, user: member_actor, organization: organization, role: 'member')
        create(:project_membership, user: member_actor, project: org_project, role: 'member')
        expect(policy(org_project, current_user: member_actor).apply(:destroy?)).to be false
      end

      it 'allows org owners to destroy' do
        org_owner = create(:user)
        create(:organization_membership, user: org_owner, organization: organization, role: 'owner')
        expect(policy(org_project, current_user: org_owner).apply(:destroy?)).to be true
      end

      it 'denies org members without project ownership from destroying' do
        org_member = create(:user)
        create(:organization_membership, user: org_member, organization: organization, role: 'member')
        expect(policy(org_project, current_user: org_member).apply(:destroy?)).to be false
      end

      it 'allows global admins' do
        expect(policy(org_project, current_user: global_admin).apply(:destroy?)).to be true
      end
    end
  end

  describe '#create?' do
    let(:org_owner) { create(:user) }

    before do
      create(:organization_membership, user: org_owner, organization: organization, role: 'owner')
    end

    it 'allows creating personal projects' do
      project = Project.new(owner: user)
      expect(policy(project, current_user: user).apply(:create?)).to be true
    end

    it 'allows org owners to create org projects' do
      project = Project.new(organization: organization)
      expect(policy(project, current_user: org_owner).apply(:create?)).to be true
    end

    it 'denies org members (non-owners) from creating org projects' do
      # user has a member-role membership (created in outer before block)
      project = Project.new(organization: organization)
      expect(policy(project, current_user: user).apply(:create?)).to be false
    end
  end

  describe 'relation_scope' do
    let(:org_owner_user) { create(:user) }
    let(:member_user) { create(:user) }
    let(:assigned_project) { create(:project, organization: organization, owner: nil) }
    let(:unassigned_project) { create(:project, organization: organization, owner: nil) }

    before do
      create(:organization_membership, user: org_owner_user, organization: organization, role: 'owner')
      create(:organization_membership, user: member_user, organization: organization, role: 'member')
      create(:project_membership, user: member_user, project: assigned_project, role: 'member')
      # unassigned_project intentionally has no project_membership for member_user
    end

    def scope_for(actor)
      p = policy(assigned_project, current_user: actor)
      p.apply_scope(Project.all, type: :active_record_relation)
    end

    it 'org owners see all org projects' do
      result = scope_for(org_owner_user)
      expect(result).to include(assigned_project, unassigned_project)
    end

    it 'members see only projects they have an explicit membership for' do
      result = scope_for(member_user)
      expect(result).to include(assigned_project)
      expect(result).not_to include(unassigned_project)
    end

    it 'users see their personal projects' do
      personal = create(:project, owner: user, organization: nil)
      p = policy(personal, current_user: user)
      result = p.apply_scope(Project.all, type: :active_record_relation)
      expect(result).to include(personal)
    end

    it 'global admins see all projects' do
      result = scope_for(global_admin)
      expect(result).to include(assigned_project, unassigned_project)
    end
  end
end

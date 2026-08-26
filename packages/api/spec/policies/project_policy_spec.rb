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

      it 'denies global admins who do not own the personal project' do
        expect(policy(personal_project, current_user: global_admin).apply(:show?)).to be false
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

      it 'denies a global admin with no org/project membership (AIX-611)' do
        expect(policy(org_project, current_user: global_admin).apply(:show?)).to be false
      end

      it 'denies show? when only an orphaned project_membership remains (AIX-611)' do
        former = create(:user)
        org_membership = create(:organization_membership, user: former, organization: organization, role: 'member')
        create(:project_membership, user: former, project: org_project, role: 'member')
        org_membership.delete

        expect(policy(org_project, current_user: former).apply(:show?)).to be false
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

      it 'denies global admins without org/project ownership (AIX-611)' do
        expect(policy(org_project, current_user: global_admin).apply(:destroy?)).to be false
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

    it 'excludes org projects once the user is no longer an org member (AIX-611)' do
      former_member = create(:user)
      org_membership = create(:organization_membership, user: former_member, organization: organization, role: 'member')
      create(:project_membership, user: former_member, project: assigned_project, role: 'member')
      # Simulate an orphaned project_membership left behind by a bypass removal path:
      # delete only the org membership, leaving the project_membership row in place.
      org_membership.delete

      p = policy(assigned_project, current_user: former_member)
      result = p.apply_scope(Project.all, type: :active_record_relation)
      expect(result).not_to include(assigned_project)
    end

    it 'excludes org projects for a global admin who left the org (AIX-611)' do
      admin = create(:user, :global_admin)
      org_membership = create(:organization_membership, user: admin, organization: organization, role: 'member')
      create(:project_membership, user: admin, project: assigned_project, role: 'member')
      org_membership.destroy!

      result = scope_for(admin)
      expect(result).not_to include(assigned_project, unassigned_project)
      expect(policy(assigned_project, current_user: admin).apply(:show?)).to be false
    end

    it 'global admins only see projects via the same membership rules as everyone else' do
      result = scope_for(global_admin)
      expect(result).not_to include(assigned_project, unassigned_project)
    end
  end
end

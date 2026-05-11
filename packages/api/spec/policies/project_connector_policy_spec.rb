# frozen_string_literal: true

require 'rails_helper'

RSpec.describe ProjectConnectorPolicy, type: :policy do
  let(:global_admin) { create(:user, :global_admin) }
  let(:org_admin) { create(:user) }
  let(:org_member) { create(:user) }
  let(:non_member) { create(:user) }

  let(:organization) { create(:organization) }
  let(:project) { create(:project, organization: organization) }
  let(:connector) { create(:project_connector, project: project) }

  before do
    create(:organization_membership, user: org_admin, organization: organization, role: 'owner')
    create(:organization_membership, user: org_member, organization: organization, role: 'member')
    create(:project_membership, user: org_member, project: project, role: 'member')
  end

  def policy(record, current_user:)
    described_class.new(record, user: current_user, organization: organization)
  end

  describe '#show? (view connector)' do
    it 'allows a project member to view' do
      expect(policy(connector, current_user: org_member).apply(:show?)).to be true
    end

    it 'allows an org admin to view' do
      expect(policy(connector, current_user: org_admin).apply(:show?)).to be true
    end

    it 'denies a non-member' do
      expect(policy(connector, current_user: non_member).apply(:show?)).to be false
    end

    it 'allows a global admin' do
      expect(policy(connector, current_user: global_admin).apply(:show?)).to be true
    end
  end

  describe '#create?' do
    it 'allows an org admin to create' do
      expect(policy(connector, current_user: org_admin).apply(:create?)).to be true
    end

    it 'denies a regular project member' do
      expect(policy(connector, current_user: org_member).apply(:create?)).to be false
    end

    it 'denies a non-member' do
      expect(policy(connector, current_user: non_member).apply(:create?)).to be false
    end

    it 'allows a global admin' do
      expect(policy(connector, current_user: global_admin).apply(:create?)).to be true
    end

    context 'with a project admin (not org admin)' do
      let(:project_admin_user) { create(:user) }

      before do
        create(:organization_membership, user: project_admin_user, organization: organization, role: 'member')
        create(:project_membership, user: project_admin_user, project: project, role: 'admin')
      end

      it 'allows a project admin to create' do
        expect(policy(connector, current_user: project_admin_user).apply(:create?)).to be true
      end
    end
  end

  describe '#update?' do
    it 'allows an org admin to update' do
      expect(policy(connector, current_user: org_admin).apply(:update?)).to be true
    end

    it 'denies a regular project member' do
      expect(policy(connector, current_user: org_member).apply(:update?)).to be false
    end

    it 'allows a global admin' do
      expect(policy(connector, current_user: global_admin).apply(:update?)).to be true
    end
  end

  describe '#destroy?' do
    it 'allows an org admin to destroy' do
      expect(policy(connector, current_user: org_admin).apply(:destroy?)).to be true
    end

    it 'denies a regular project member' do
      expect(policy(connector, current_user: org_member).apply(:destroy?)).to be false
    end

    it 'allows a global admin' do
      expect(policy(connector, current_user: global_admin).apply(:destroy?)).to be true
    end
  end

  describe '#test?' do
    it 'allows an org admin to test' do
      expect(policy(connector, current_user: org_admin).apply(:test?)).to be true
    end

    it 'denies a regular project member' do
      expect(policy(connector, current_user: org_member).apply(:test?)).to be false
    end

    it 'allows a global admin' do
      expect(policy(connector, current_user: global_admin).apply(:test?)).to be true
    end
  end

  describe '#sync?' do
    it 'allows an org admin to sync' do
      expect(policy(connector, current_user: org_admin).apply(:sync?)).to be true
    end

    it 'denies a regular project member' do
      expect(policy(connector, current_user: org_member).apply(:sync?)).to be false
    end

    it 'allows a global admin' do
      expect(policy(connector, current_user: global_admin).apply(:sync?)).to be true
    end
  end

  describe 'personal project' do
    let(:personal_owner) { create(:user) }
    let(:personal_project) { create(:project, :personal, owner: personal_owner) }
    let(:personal_connector) { create(:project_connector, project: personal_project) }

    def personal_policy(record, current_user:)
      described_class.new(record, user: current_user, organization: nil)
    end

    it 'allows the owner to view' do
      expect(personal_policy(personal_connector, current_user: personal_owner).apply(:show?)).to be true
    end

    it 'allows the owner to manage' do
      expect(personal_policy(personal_connector, current_user: personal_owner).apply(:create?)).to be true
    end

    it 'denies another user from viewing' do
      expect(personal_policy(personal_connector, current_user: non_member).apply(:show?)).to be false
    end

    it 'denies another user from managing' do
      expect(personal_policy(personal_connector, current_user: non_member).apply(:create?)).to be false
    end
  end
end

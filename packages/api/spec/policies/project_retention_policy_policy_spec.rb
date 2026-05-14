# frozen_string_literal: true

require 'rails_helper'

RSpec.describe ProjectRetentionPolicyPolicy, type: :policy do
  let(:org_owner)    { create(:user) }
  let(:org_member)   { create(:user) }
  let(:viewer)       { create(:user) }
  let(:global_admin) { create(:user, :global_admin) }
  let(:organization) { create(:organization) }
  let(:project)      { create(:project, organization: organization) }
  let(:project_policy_record) { build(:project_retention_policy, project: project) }

  before do
    create(:organization_membership, user: org_owner,  organization: organization, role: 'owner')
    create(:organization_membership, user: org_member, organization: organization, role: 'member')
    create(:organization_membership, user: viewer,     organization: organization, role: 'viewer')
    # global_admin intentionally NOT a member — isolates global_admin? from org_admin?
  end

  def policy(record, current_user:)
    described_class.new(record, user: current_user, organization: organization)
  end

  shared_examples 'allows only personal project owner' do |action|
    let(:personal_owner)        { create(:user) }
    let(:other_user)            { create(:user) }
    let(:personal_project)      { create(:project, :personal, owner: personal_owner) }
    let(:personal_policy_record) { build(:project_retention_policy, project: personal_project) }

    it 'allows the personal project owner' do
      expect(described_class.new(personal_policy_record, user: personal_owner, organization: nil).apply(action)).to be true
    end

    it 'denies another user on a personal project' do
      expect(described_class.new(personal_policy_record, user: other_user, organization: nil).apply(action)).to be false
    end
  end

  describe '#show?' do
    it 'allows org owner (implicit project owner)' do
      expect(policy(project_policy_record, current_user: org_owner).apply(:show?)).to be true
    end

    it 'allows user with project owner membership' do
      create(:project_membership, user: org_member, project: project, role: 'owner')
      expect(policy(project_policy_record, current_user: org_member).apply(:show?)).to be true
    end

    it 'denies org member without project owner role' do
      create(:project_membership, user: org_member, project: project, role: 'member')
      expect(policy(project_policy_record, current_user: org_member).apply(:show?)).to be false
    end

    it 'denies viewer' do
      expect(policy(project_policy_record, current_user: viewer).apply(:show?)).to be false
    end

    it 'allows global_admin who is not a member' do
      expect(policy(project_policy_record, current_user: global_admin).apply(:show?)).to be true
    end

    context 'with a personal project' do
      include_examples 'allows only personal project owner', :show?
    end
  end

  describe '#update?' do
    it 'allows org owner (implicit project owner)' do
      expect(policy(project_policy_record, current_user: org_owner).apply(:update?)).to be true
    end

    it 'allows user with project owner membership' do
      create(:project_membership, user: org_member, project: project, role: 'owner')
      expect(policy(project_policy_record, current_user: org_member).apply(:update?)).to be true
    end

    it 'denies org member without project owner role' do
      create(:project_membership, user: org_member, project: project, role: 'member')
      expect(policy(project_policy_record, current_user: org_member).apply(:update?)).to be false
    end

    it 'denies viewer' do
      expect(policy(project_policy_record, current_user: viewer).apply(:update?)).to be false
    end

    it 'allows global_admin who is not a member' do
      expect(policy(project_policy_record, current_user: global_admin).apply(:update?)).to be true
    end

    context 'with a personal project' do
      include_examples 'allows only personal project owner', :update?
    end
  end

  describe '#create?' do
    it 'allows org owner' do
      expect(policy(project_policy_record, current_user: org_owner).apply(:create?)).to be true
    end

    it 'denies org member' do
      expect(policy(project_policy_record, current_user: org_member).apply(:create?)).to be false
    end

    it 'denies viewer' do
      expect(policy(project_policy_record, current_user: viewer).apply(:create?)).to be false
    end

    it 'allows global_admin who is not a member' do
      expect(policy(project_policy_record, current_user: global_admin).apply(:create?)).to be true
    end
  end

  describe '#destroy?' do
    it 'allows org owner' do
      expect(policy(project_policy_record, current_user: org_owner).apply(:destroy?)).to be true
    end

    it 'denies org member' do
      expect(policy(project_policy_record, current_user: org_member).apply(:destroy?)).to be false
    end

    it 'denies viewer' do
      expect(policy(project_policy_record, current_user: viewer).apply(:destroy?)).to be false
    end

    it 'allows global_admin who is not a member' do
      expect(policy(project_policy_record, current_user: global_admin).apply(:destroy?)).to be true
    end
  end
end

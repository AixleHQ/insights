# frozen_string_literal: true

require 'rails_helper'

RSpec.describe RepositoryPolicy, type: :policy do
  let(:admin) { create(:user) }
  let(:member) { create(:user) }
  let(:non_member) { create(:user) }
  let(:global_admin) { create(:user, :global_admin) }
  let(:organization) { create(:organization) }
  let(:project) { create(:project, organization: organization, owner: nil) }
  let(:connector) { create(:organization_connector, organization: organization) }
  let(:repository) { create(:repository, project: project, organization_connector: connector) }

  before do
    create(:organization_membership, user: admin, organization: organization)
    create(:organization_membership, user: member, organization: organization)
    create(:project_membership, user: admin, project: project, role: "owner")
    create(:project_membership, user: member, project: project, role: 'member')
  end

  def policy(record, current_user:, org: nil)
    described_class.new(record, user: current_user, organization: org)
  end

  describe '#show?' do
    it 'allows project members to view' do
      expect(policy(repository, current_user: member).apply(:show?)).to be true
    end

    it 'denies non-members' do
      expect(policy(repository, current_user: non_member).apply(:show?)).to be false
    end

    it 'allows global admins' do
      expect(policy(repository, current_user: global_admin).apply(:show?)).to be true
    end
  end

  describe '#create?' do
    it 'allows project admins to create' do
      expect(policy(repository, current_user: admin).apply(:create?)).to be true
    end

    it 'denies non-admins' do
      expect(policy(repository, current_user: member).apply(:create?)).to be false
    end
  end

  describe '#update?' do
    it 'allows project admins to update' do
      expect(policy(repository, current_user: admin).apply(:update?)).to be true
    end

    it 'denies non-admins' do
      expect(policy(repository, current_user: member).apply(:update?)).to be false
    end
  end

  describe '#destroy?' do
    it 'allows project admins to destroy' do
      expect(policy(repository, current_user: admin).apply(:destroy?)).to be true
    end

    it 'denies non-admins' do
      expect(policy(repository, current_user: member).apply(:destroy?)).to be false
    end
  end

  describe '#sync?' do
    it 'allows project admins to sync' do
      expect(policy(repository, current_user: admin).apply(:sync?)).to be true
    end

    it 'denies non-admins' do
      expect(policy(repository, current_user: member).apply(:sync?)).to be false
    end
  end

  describe 'personal project repositories' do
    let(:personal_project) { create(:project, owner: admin, organization: nil) }
    let(:personal_repo) { create(:repository, project: personal_project, organization_connector: connector) }

    it 'allows project owner to manage' do
      expect(policy(personal_repo, current_user: admin).apply(:create?)).to be true
      expect(policy(personal_repo, current_user: admin).apply(:update?)).to be true
      expect(policy(personal_repo, current_user: admin).apply(:destroy?)).to be true
    end
  end
end

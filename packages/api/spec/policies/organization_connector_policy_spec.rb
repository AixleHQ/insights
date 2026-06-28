# frozen_string_literal: true

require 'rails_helper'

RSpec.describe OrganizationConnectorPolicy, type: :policy do
  let(:owner) { create(:user) }
  let(:admin) { create(:user) }
  let(:member) { create(:user) }
  let(:non_member) { create(:user) }
  let(:global_admin) { create(:user, :global_admin) }
  let(:organization) { create(:organization) }
  let(:connector) { create(:organization_connector, organization: organization) }

  before do
    create(:organization_membership, user: owner, organization: organization, role: 'owner')
    create(:organization_membership, user: admin, organization: organization, role: 'owner')
    create(:organization_membership, user: member, organization: organization, role: 'member')
  end

  def policy(record, current_user:)
    described_class.new(record, user: current_user, organization: organization)
  end

  describe '#index?' do
    it 'allows members to view' do
      expect(policy(connector, current_user: member).apply(:index?)).to be true
    end

    it 'denies non-members' do
      expect(policy(connector, current_user: non_member).apply(:index?)).to be false
    end

    it 'allows global admins' do
      expect(policy(connector, current_user: global_admin).apply(:index?)).to be true
    end
  end

  describe '#show?' do
    it 'allows members to view' do
      expect(policy(connector, current_user: member).apply(:show?)).to be true
    end

    it 'denies non-members' do
      expect(policy(connector, current_user: non_member).apply(:show?)).to be false
    end

    it 'allows global admins' do
      expect(policy(connector, current_user: global_admin).apply(:show?)).to be true
    end
  end

  describe '#create?' do
    it 'allows admins to create' do
      expect(policy(connector, current_user: admin).apply(:create?)).to be true
    end

    it 'allows owners to create' do
      expect(policy(connector, current_user: owner).apply(:create?)).to be true
    end

    it 'denies regular members' do
      expect(policy(connector, current_user: member).apply(:create?)).to be false
    end

    it 'denies non-members' do
      expect(policy(connector, current_user: non_member).apply(:create?)).to be false
    end

    it 'allows global admins' do
      expect(policy(connector, current_user: global_admin).apply(:create?)).to be true
    end
  end

  describe '#update?' do
    it 'allows admins to update' do
      expect(policy(connector, current_user: admin).apply(:update?)).to be true
    end

    it 'allows owners to update' do
      expect(policy(connector, current_user: owner).apply(:update?)).to be true
    end

    it 'denies regular members' do
      expect(policy(connector, current_user: member).apply(:update?)).to be false
    end

    it 'allows global admins' do
      expect(policy(connector, current_user: global_admin).apply(:update?)).to be true
    end
  end

  describe '#destroy?' do
    it 'allows admins to destroy' do
      expect(policy(connector, current_user: admin).apply(:destroy?)).to be true
    end

    it 'allows owners to destroy' do
      expect(policy(connector, current_user: owner).apply(:destroy?)).to be true
    end

    it 'denies regular members' do
      expect(policy(connector, current_user: member).apply(:destroy?)).to be false
    end

    it 'allows global admins' do
      expect(policy(connector, current_user: global_admin).apply(:destroy?)).to be true
    end
  end

  describe '#test?' do
    it 'allows admins to test' do
      expect(policy(connector, current_user: admin).apply(:test?)).to be true
    end

    it 'denies regular members' do
      expect(policy(connector, current_user: member).apply(:test?)).to be false
    end

    it 'allows global admins' do
      expect(policy(connector, current_user: global_admin).apply(:test?)).to be true
    end
  end

  describe '#sync?' do
    it 'allows admins to sync' do
      expect(policy(connector, current_user: admin).apply(:sync?)).to be true
    end

    it 'denies regular members' do
      expect(policy(connector, current_user: member).apply(:sync?)).to be false
    end

    it 'allows global admins' do
      expect(policy(connector, current_user: global_admin).apply(:sync?)).to be true
    end
  end

  describe '#authorize?' do
    it 'allows admins to authorize' do
      expect(policy(connector, current_user: admin).apply(:authorize?)).to be true
    end

    it 'denies regular members' do
      expect(policy(connector, current_user: member).apply(:authorize?)).to be false
    end

    it 'allows global admins' do
      expect(policy(connector, current_user: global_admin).apply(:authorize?)).to be true
    end
  end

  describe '#callback?' do
    it 'allows admins' do
      expect(policy(connector, current_user: admin).apply(:callback?)).to be true
    end

    it 'denies regular members' do
      expect(policy(connector, current_user: member).apply(:callback?)).to be false
    end

    it 'allows global admins' do
      expect(policy(connector, current_user: global_admin).apply(:callback?)).to be true
    end
  end
end

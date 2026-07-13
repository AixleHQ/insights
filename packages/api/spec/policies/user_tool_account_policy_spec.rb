# frozen_string_literal: true

require 'rails_helper'

RSpec.describe UserToolAccountPolicy, type: :policy do
  let(:user) { create(:user) }
  let(:other_user) { create(:user) }
  let(:global_admin) { create(:user, :global_admin) }
  let(:organization) { create(:organization) }
  let(:user_membership) { create(:organization_membership, user: user, organization: organization) }
  let(:other_membership) { create(:organization_membership, user: other_user, organization: organization) }
  let(:tool_account) { create(:user_tool_account, organization_membership: user_membership) }
  let(:other_tool_account) { create(:user_tool_account, organization_membership: other_membership) }

  def policy(record, current_user:)
    described_class.new(record, user: current_user, organization: organization)
  end

  describe '#index?' do
    it 'allows user to view own tool accounts' do
      expect(policy(tool_account, current_user: user).apply(:index?)).to be true
    end

    it 'denies viewing other users tool accounts' do
      expect(policy(other_tool_account, current_user: user).apply(:index?)).to be false
    end

    it 'allows global admins to view any' do
      expect(policy(other_tool_account, current_user: global_admin).apply(:index?)).to be true
    end
  end

  describe '#show?' do
    it 'allows user to view own tool account' do
      expect(policy(tool_account, current_user: user).apply(:show?)).to be true
    end

    it 'denies viewing other users tool accounts' do
      expect(policy(other_tool_account, current_user: user).apply(:show?)).to be false
    end

    it 'allows global admins to view any' do
      expect(policy(other_tool_account, current_user: global_admin).apply(:show?)).to be true
    end
  end

  describe '#create?' do
    it 'allows user to link own tool account' do
      expect(policy(user_membership, current_user: user).apply(:create?)).to be true
    end

    it 'denies linking for other users' do
      expect(policy(other_membership, current_user: user).apply(:create?)).to be false
    end

    it 'denies linking when the user is only a viewer (post-AIX-503)' do
      viewer_membership = create(:organization_membership, :viewer, user: user, organization: organization)
      expect(policy(viewer_membership, current_user: user).apply(:create?)).to be false
    end

    it 'allows global admins' do
      expect(policy(other_membership, current_user: global_admin).apply(:create?)).to be true
    end
  end

  describe '#update?' do
    it 'allows user to update own tool account' do
      expect(policy(tool_account, current_user: user).apply(:update?)).to be true
    end

    it 'denies updating other users tool accounts' do
      expect(policy(other_tool_account, current_user: user).apply(:update?)).to be false
    end

    it 'denies rotating tokens when the user is only a viewer (post-AIX-503)' do
      viewer = create(:user)
      viewer_membership = create(:organization_membership, :viewer, user: viewer, organization: organization)
      viewer_account = create(:user_tool_account, organization_membership: viewer_membership)
      expect(policy(viewer_account, current_user: viewer).apply(:update?)).to be false
    end

    it 'allows global admins' do
      expect(policy(other_tool_account, current_user: global_admin).apply(:update?)).to be true
    end
  end

  describe '#destroy?' do
    it 'allows user to unlink own tool account' do
      expect(policy(tool_account, current_user: user).apply(:destroy?)).to be true
    end

    it 'denies unlinking other users tool accounts' do
      expect(policy(other_tool_account, current_user: user).apply(:destroy?)).to be false
    end

    it 'allows global admins' do
      expect(policy(other_tool_account, current_user: global_admin).apply(:destroy?)).to be true
    end
  end
end

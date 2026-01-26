# frozen_string_literal: true

require 'rails_helper'

RSpec.describe UserPolicy, type: :policy do
  let(:user) { create(:user) }
  let(:other_user) { create(:user) }
  let(:global_admin) { create(:user, :global_admin) }

  def policy(record, current_user:, org: nil)
    described_class.new(record, user: current_user, organization: org)
  end

  describe '#show?' do
    it 'allows users to view their own profile' do
      expect(policy(user, current_user: user).apply(:show?)).to be true
    end

    it 'denies users from viewing other profiles' do
      expect(policy(other_user, current_user: user).apply(:show?)).to be false
    end

    it 'allows global admins to view any profile' do
      expect(policy(other_user, current_user: global_admin).apply(:show?)).to be true
    end
  end

  describe '#update?' do
    it 'allows users to update their own profile' do
      expect(policy(user, current_user: user).apply(:update?)).to be true
    end

    it 'denies users from updating other profiles' do
      expect(policy(other_user, current_user: user).apply(:update?)).to be false
    end

    it 'allows global admins to update any profile' do
      expect(policy(other_user, current_user: global_admin).apply(:update?)).to be true
    end
  end

  describe '#destroy?' do
    it 'denies regular users from destroying profiles' do
      expect(policy(user, current_user: user).apply(:destroy?)).to be false
    end

    it 'allows global admins to destroy users' do
      expect(policy(other_user, current_user: global_admin).apply(:destroy?)).to be true
    end
  end

  describe '#index?' do
    it 'denies regular users' do
      expect(policy(nil, current_user: user).apply(:index?)).to be false
    end

    it 'allows global admins' do
      expect(policy(nil, current_user: global_admin).apply(:index?)).to be true
    end
  end

end

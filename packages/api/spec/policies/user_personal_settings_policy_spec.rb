# frozen_string_literal: true

require 'rails_helper'

RSpec.describe UserPersonalSettingsPolicy, type: :policy do
  let(:settings_owner) { create(:user) }
  let(:other_user)     { create(:user) }
  let(:global_admin)   { create(:user, :global_admin) }
  let(:personal_setting) { build(:user_personal_settings, user: settings_owner) }

  def policy(record, current_user:)
    described_class.new(record, user: current_user, organization: nil)
  end

  describe '#show?' do
    it 'allows the settings owner' do
      expect(policy(personal_setting, current_user: settings_owner).apply(:show?)).to be true
    end

    it 'denies another user' do
      expect(policy(personal_setting, current_user: other_user).apply(:show?)).to be false
    end

    it 'allows global_admin' do
      expect(policy(personal_setting, current_user: global_admin).apply(:show?)).to be true
    end
  end

  describe '#create?' do
    it 'allows the settings owner' do
      expect(policy(personal_setting, current_user: settings_owner).apply(:create?)).to be true
    end

    it 'denies another user' do
      expect(policy(personal_setting, current_user: other_user).apply(:create?)).to be false
    end

    it 'allows global_admin' do
      expect(policy(personal_setting, current_user: global_admin).apply(:create?)).to be true
    end
  end

  describe '#update?' do
    it 'allows the settings owner' do
      expect(policy(personal_setting, current_user: settings_owner).apply(:update?)).to be true
    end

    it 'denies another user' do
      expect(policy(personal_setting, current_user: other_user).apply(:update?)).to be false
    end

    it 'allows global_admin' do
      expect(policy(personal_setting, current_user: global_admin).apply(:update?)).to be true
    end
  end

  describe '#destroy?' do
    it 'allows the settings owner' do
      expect(policy(personal_setting, current_user: settings_owner).apply(:destroy?)).to be true
    end

    it 'denies another user' do
      expect(policy(personal_setting, current_user: other_user).apply(:destroy?)).to be false
    end

    it 'allows global_admin' do
      expect(policy(personal_setting, current_user: global_admin).apply(:destroy?)).to be true
    end
  end
end

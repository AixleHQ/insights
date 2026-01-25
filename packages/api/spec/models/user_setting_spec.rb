require 'rails_helper'

RSpec.describe UserSetting, type: :model do
  describe 'associations' do
    it { should belong_to(:user) }
  end

  describe 'validations' do
    subject { build(:user_setting) }

    it { should validate_presence_of(:key) }
    it { should validate_uniqueness_of(:key).scoped_to(:user_id) }
    it { should validate_presence_of(:value) }
  end

  describe '.get' do
    let(:user) { create(:user) }

    it 'returns the setting value when it exists' do
      create(:user_setting, user: user, key: 'theme', value: 'dark')
      expect(UserSetting.get(user, 'theme')).to eq('dark')
    end

    it 'returns default when setting does not exist' do
      expect(UserSetting.get(user, 'missing', default: 'default_value')).to eq('default_value')
    end

    it 'returns nil when setting does not exist and no default' do
      expect(UserSetting.get(user, 'missing')).to be_nil
    end
  end

  describe '.set' do
    let(:user) { create(:user) }

    it 'creates a new setting when it does not exist' do
      expect {
        UserSetting.set(user, 'new_key', 'new_value')
      }.to change(UserSetting, :count).by(1)
    end

    it 'updates an existing setting' do
      create(:user_setting, user: user, key: 'existing', value: 'old')

      expect {
        UserSetting.set(user, 'existing', 'new')
      }.not_to change(UserSetting, :count)

      expect(UserSetting.get(user, 'existing')).to eq('new')
    end

    it 'returns the setting object' do
      setting = UserSetting.set(user, 'key', 'value')
      expect(setting).to be_a(UserSetting)
      expect(setting.value).to eq('value')
    end
  end
end

require 'rails_helper'

RSpec.describe OrganizationSetting, type: :model do
  describe 'associations' do
    it { should belong_to(:organization) }
  end

  describe 'validations' do
    subject { build(:organization_setting) }

    it { should validate_presence_of(:key) }
    it { should validate_uniqueness_of(:key).scoped_to(:organization_id) }
    it { should validate_presence_of(:value) }
  end

  describe '.get' do
    let(:organization) { create(:organization) }

    it 'returns the setting value when it exists' do
      create(:organization_setting, organization: organization, key: 'theme', value: 'dark')
      expect(OrganizationSetting.get(organization, 'theme')).to eq('dark')
    end

    it 'returns default when setting does not exist' do
      expect(OrganizationSetting.get(organization, 'missing', default: 'default_value')).to eq('default_value')
    end

    it 'returns nil when setting does not exist and no default' do
      expect(OrganizationSetting.get(organization, 'missing')).to be_nil
    end
  end

  describe '.set' do
    let(:organization) { create(:organization) }

    it 'creates a new setting when it does not exist' do
      expect {
        OrganizationSetting.set(organization, 'new_key', 'new_value')
      }.to change(OrganizationSetting, :count).by(1)
    end

    it 'updates an existing setting' do
      create(:organization_setting, organization: organization, key: 'existing', value: 'old')

      expect {
        OrganizationSetting.set(organization, 'existing', 'new')
      }.not_to change(OrganizationSetting, :count)

      expect(OrganizationSetting.get(organization, 'existing')).to eq('new')
    end

    it 'returns the setting object' do
      setting = OrganizationSetting.set(organization, 'key', 'value')
      expect(setting).to be_a(OrganizationSetting)
      expect(setting.value).to eq('value')
    end
  end
end

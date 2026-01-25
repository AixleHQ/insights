require 'rails_helper'

RSpec.describe ProjectSetting, type: :model do
  describe 'associations' do
    it { should belong_to(:project) }
  end

  describe 'validations' do
    subject { build(:project_setting) }

    it { should validate_presence_of(:key) }

    it 'validates uniqueness of key per project' do
      setting = create(:project_setting)
      duplicate = build(:project_setting, project: setting.project, key: setting.key)
      expect(duplicate).not_to be_valid
    end

    it { should validate_presence_of(:value) }
  end

  describe '.get' do
    let(:project) { create(:project) }

    it 'returns the setting value when it exists' do
      create(:project_setting, project: project, key: 'theme', value: 'dark')
      expect(ProjectSetting.get(project, 'theme')).to eq('dark')
    end

    it 'returns default when setting does not exist' do
      expect(ProjectSetting.get(project, 'missing', default: 'default_value')).to eq('default_value')
    end

    it 'returns nil when setting does not exist and no default' do
      expect(ProjectSetting.get(project, 'missing')).to be_nil
    end
  end

  describe '.set' do
    let(:project) { create(:project) }

    it 'creates a new setting when it does not exist' do
      expect {
        ProjectSetting.set(project, 'new_key', 'new_value')
      }.to change(ProjectSetting, :count).by(1)
    end

    it 'updates an existing setting' do
      create(:project_setting, project: project, key: 'existing', value: 'old')

      expect {
        ProjectSetting.set(project, 'existing', 'new')
      }.not_to change(ProjectSetting, :count)

      expect(ProjectSetting.get(project, 'existing')).to eq('new')
    end

    it 'returns the setting object' do
      setting = ProjectSetting.set(project, 'key', 'value')
      expect(setting).to be_a(ProjectSetting)
      expect(setting.value).to eq('value')
    end
  end
end

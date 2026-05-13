require 'rails_helper'

RSpec.describe UserPersonalSettings, type: :model do
  describe 'associations' do
    it { is_expected.to belong_to(:user) }
  end

  describe 'validations' do
    subject { build(:user_personal_settings) }

    it { is_expected.to validate_uniqueness_of(:user_id).ignoring_case_sensitivity }
  end

  describe 'defaults' do
    it 'defaults alert_email to true' do
      expect(described_class.new.alert_email).to eq(true)
    end

    it 'defaults alert_slack to false' do
      expect(described_class.new.alert_slack).to eq(false)
    end

    it 'leaves cost_threshold_cents nil' do
      expect(described_class.new.cost_threshold_cents).to be_nil
    end

    it 'leaves token_threshold nil' do
      expect(described_class.new.token_threshold).to be_nil
    end
  end
end

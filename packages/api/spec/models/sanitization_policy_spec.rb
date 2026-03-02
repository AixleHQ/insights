require 'rails_helper'

RSpec.describe SanitizationPolicy, type: :model do
  describe 'associations' do
    it { should have_many(:audit_logs).with_foreign_key(:policy_version_id).dependent(:restrict_with_error) }
  end

  describe 'validations' do
    subject { build(:sanitization_policy) }

    # Note: version presence is validated, but auto-assigned by before_validation callback
    # Testing validate_presence_of with shoulda-matchers doesn't work with auto-assignment callbacks
    it { should validate_uniqueness_of(:version) }
    it { should validate_numericality_of(:version).only_integer.is_greater_than(0) }
    it { should validate_presence_of(:name) }
    it { should allow_value(true).for(:is_active) }
    it { should allow_value(false).for(:is_active) }
  end

  describe 'callbacks' do
    describe 'before_save :set_effective_at' do
      it 'sets effective_at when activating' do
        policy = create(:sanitization_policy, is_active: false)

        freeze_time do
          policy.update!(is_active: true)
          expect(policy.effective_at).to eq(Time.current)
        end
      end

      it 'does not change effective_at when already active' do
        policy = create(:sanitization_policy, :active)
        original_effective_at = policy.effective_at

        travel_to 1.hour.from_now do
          policy.update!(name: 'New Name')
          expect(policy.effective_at).to eq(original_effective_at)
        end
      end
    end

    describe 'after_save :deactivate_other_policies' do
      it 'deactivates other policies when activating one' do
        policy1 = create(:sanitization_policy, :active)
        policy2 = create(:sanitization_policy, is_active: false)

        policy2.update!(is_active: true)

        expect(policy1.reload.is_active).to be false
        expect(policy2.is_active).to be true
      end
    end
  end

  describe 'scopes' do
    describe '.active' do
      it 'returns only active policies' do
        active = create(:sanitization_policy, :active)
        inactive = create(:sanitization_policy, is_active: false)

        expect(SanitizationPolicy.active).to include(active)
        expect(SanitizationPolicy.active).not_to include(inactive)
      end
    end

    describe '.by_version' do
      it 'returns policies ordered by version descending' do
        policy1 = create(:sanitization_policy, version: 1)
        policy3 = create(:sanitization_policy, version: 3)
        policy2 = create(:sanitization_policy, version: 2)

        expect(SanitizationPolicy.by_version.to_a).to eq([ policy3, policy2, policy1 ])
      end
    end
  end

  describe '.current' do
    it 'returns the active policy' do
      inactive = create(:sanitization_policy, is_active: false, version: 1)
      active = create(:sanitization_policy, :active, version: 2)

      expect(SanitizationPolicy.current).to eq(active)
    end

    it 'returns the latest version when no active policy' do
      policy1 = create(:sanitization_policy, is_active: false, version: 1)
      policy2 = create(:sanitization_policy, is_active: false, version: 2)

      expect(SanitizationPolicy.current).to eq(policy2)
    end
  end

  describe '.next_version' do
    it 'returns 1 when no policies exist' do
      expect(SanitizationPolicy.next_version).to eq(1)
    end

    it 'returns the next version number' do
      create(:sanitization_policy, version: 5)
      expect(SanitizationPolicy.next_version).to eq(6)
    end
  end

  describe '#activate!' do
    it 'sets is_active to true' do
      policy = create(:sanitization_policy, is_active: false)
      policy.activate!
      expect(policy.is_active).to be true
    end
  end

  describe '#deactivate!' do
    it 'sets is_active to false' do
      policy = create(:sanitization_policy, :active)
      policy.deactivate!
      expect(policy.is_active).to be false
    end
  end
end

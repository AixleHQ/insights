FactoryBot.define do
  factory :sanitization_policy do
    sequence(:version) { |n| n }
    sequence(:name) { |n| "Policy v#{n}" }
    classification_rules { { patterns: [] } }
    sanitization_rules { { actions: [] } }
    is_active { false }

    trait :active do
      is_active { true }
      effective_at { Time.current }
    end
  end
end

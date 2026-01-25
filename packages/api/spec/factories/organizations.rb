FactoryBot.define do
  factory :organization do
    sequence(:name) { |n| "Organization #{n}" }
    sequence(:slug) { |n| "org-#{n}" }
    description { Faker::Company.catch_phrase }
    is_active { true }

    trait :inactive do
      is_active { false }
    end

    trait :with_retention_policy do
      after(:create) do |org|
        org.retention_policy || create(:organization_retention_policy, organization: org)
      end
    end
  end
end

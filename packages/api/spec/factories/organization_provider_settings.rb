FactoryBot.define do
  factory :organization_provider_setting do
    organization
    provider { "github" }
    enabled { true }

    trait :disabled do
      enabled { false }
    end
  end
end

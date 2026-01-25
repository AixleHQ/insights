FactoryBot.define do
  factory :project do
    sequence(:name) { |n| "Project #{n}" }
    sequence(:slug) { |n| "project-#{n}" }
    description { Faker::Lorem.sentence }
    is_active { true }
    organization

    trait :personal do
      organization { nil }
      owner factory: :user
    end

    trait :inactive do
      is_active { false }
    end
  end
end

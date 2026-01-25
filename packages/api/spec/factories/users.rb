FactoryBot.define do
  factory :user do
    keycloak_sub { SecureRandom.uuid }
    sequence(:email) { |n| "user#{n}@example.com" }
    name { Faker::Name.name }
    avatar_url { Faker::Avatar.image }
    global_admin { false }

    trait :admin do
      global_admin { true }
    end

    trait :global_admin do
      global_admin { true }
    end
  end
end

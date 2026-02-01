FactoryBot.define do
  factory :invitation do
    organization
    association :invited_by, factory: :user
    sequence(:email) { |n| "invited#{n}@example.com" }
    role { 'member' }
    status { 'pending' }
    expires_at { 7.days.from_now }

    trait :admin do
      role { 'admin' }
    end

    trait :owner do
      role { 'owner' }
    end

    trait :viewer do
      role { 'viewer' }
    end

    trait :accepted do
      status { 'accepted' }
      accepted_at { Time.current }
    end

    trait :revoked do
      status { 'revoked' }
    end

    trait :expired do
      status { 'expired' }
      expires_at { 1.day.ago }
    end

    trait :expiring_soon do
      expires_at { 1.hour.from_now }
    end
  end
end

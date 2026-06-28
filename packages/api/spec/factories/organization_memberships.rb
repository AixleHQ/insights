FactoryBot.define do
  factory :organization_membership do
    user
    organization
    role { 'member' }

    trait :owner do
      role { 'owner' }
    end

    trait :viewer do
      role { 'viewer' }
    end
  end
end

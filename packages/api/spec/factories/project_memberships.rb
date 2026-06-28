# frozen_string_literal: true

FactoryBot.define do
  factory :project_membership do
    user
    project
    role { "member" }

    trait :owner do
      role { "owner" }
    end

    trait :viewer do
      role { "viewer" }
    end
  end
end

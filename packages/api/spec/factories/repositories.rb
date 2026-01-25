FactoryBot.define do
  factory :repository do
    project
    organization_connector
    sequence(:external_id) { |n| "repo-#{n}" }
    sequence(:name) { |n| "repo-#{n}" }
    sequence(:full_name) { |n| "org/repo-#{n}" }
    url { "https://github.com/#{full_name}" }
    default_branch { 'main' }
    is_private { false }

    trait :private do
      is_private { true }
    end
  end
end

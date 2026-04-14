# frozen_string_literal: true

FactoryBot.define do
  factory :issue do
    organization
    project
    organization_connector factory: [ :organization_connector, :jira ]

    sequence(:external_id) { |n| "100#{n}" }
    sequence(:key) { |n| "PROJ-#{n}" }
    summary { Faker::Lorem.sentence(word_count: 6) }
    status { "In Progress" }
    status_category { "indeterminate" }
    issue_type { "Story" }
    priority { "Medium" }
    jira_project_key { "PROJ" }
    jira_project_id { "10000" }
    assignee_name { Faker::Name.name }
    reporter_name { Faker::Name.name }
    labels { [] }
    synced_at { 1.hour.ago }

    trait :todo do
      status { "To Do" }
      status_category { "new" }
    end

    trait :in_progress do
      status { "In Progress" }
      status_category { "indeterminate" }
    end

    trait :done do
      status { "Done" }
      status_category { "done" }
    end

    trait :bug do
      issue_type { "Bug" }
    end

    trait :epic do
      issue_type { "Epic" }
    end

    trait :with_assignee do
      assignee factory: :user
    end
  end
end

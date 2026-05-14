# frozen_string_literal: true

FactoryBot.define do
  factory :retention_purge_log do
    organization
    project { nil }
    retention_policy_type { :org }
    retention_days_applied { 90 }
    cutoff_timestamp { 90.days.ago }
    records_deleted { 0 }
    job_run_at { Time.current }
    status { :success }
    error_message { nil }

    trait :project_level do
      project
      retention_policy_type { :project }
    end

    trait :failed do
      status { :failed }
      error_message { "Something went wrong" }
    end

    trait :with_deletions do
      records_deleted { 42 }
    end
  end
end

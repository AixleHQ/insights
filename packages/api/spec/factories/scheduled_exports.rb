FactoryBot.define do
  factory :scheduled_export do
    organization
    association :created_by, factory: :user
    report_type { "cost_by_tool" }
    format      { "csv" }
    frequency   { "daily" }
    recipients  { [ "report@example.com" ] }
    active      { true }
    next_run_at { 1.hour.from_now }

    trait :weekly do
      frequency   { "weekly" }
      day_of_week { 1 }
    end

    trait :monthly do
      frequency    { "monthly" }
      day_of_month { 15 }
    end

    trait :json_format do
      format { "json" }
    end

    trait :inactive do
      active { false }
    end

    trait :overdue do
      # Update after create so the before_validation callback doesn't override the value
      after(:create) { |e| e.update_column(:next_run_at, 1.hour.ago) }
    end
  end
end

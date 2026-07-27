FactoryBot.define do
  factory :export_record do
    organization
    association :created_by, factory: :user
    report_type { "cost_by_tool" }
    format      { "csv" }
    status      { "pending" }

    trait :generating do
      status { "generating" }
    end

    trait :ready do
      status         { "ready" }
      row_count      { 42 }
      file_size_bytes { 1024 }
      expires_at     { 7.days.from_now }
    end

    trait :failed do
      status { "failed" }
    end

    trait :expired do
      status     { "ready" }
      expires_at { 1.day.ago }
    end

    trait :json_format do
      format { "json" }
    end
  end
end

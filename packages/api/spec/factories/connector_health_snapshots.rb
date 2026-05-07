FactoryBot.define do
  factory :connector_health_snapshot do
    organization_connector
    status { "success" }
    sync_duration_ms { 1500 }
    snapshotted_at { Time.current }

    trait :success do
      status { "success" }
      error_message { nil }
    end

    trait :failure do
      status { "failure" }
      error_message { "Connection timed out" }
    end

    trait :old do
      snapshotted_at { 91.days.ago }
    end
  end
end

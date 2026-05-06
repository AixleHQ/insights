# frozen_string_literal: true

FactoryBot.define do
  factory :webhook_delivery do
    organization_connector
    provider   { "github" }
    event_type { "push" }
    sequence(:raw_event_key) { |n| "org/2026/05/01/14/#{SecureRandom.uuid}-#{n}.enc" }
    status   { "pending" }
    attempts { 0 }

    trait :processing do
      status            { "processing" }
      attempts          { 1 }
      last_attempted_at { 5.minutes.ago }
    end

    trait :delivered do
      status       { "delivered" }
      attempts     { 1 }
      last_attempted_at { 10.minutes.ago }
      delivered_at { 9.minutes.ago }
    end

    trait :failed do
      status            { "failed" }
      attempts          { 3 }
      last_attempted_at { 1.hour.ago }
      last_error        { "Connection timeout" }
    end
  end
end

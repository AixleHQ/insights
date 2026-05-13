FactoryBot.define do
  factory :notification_route do
    organization
    notification_type { "cost_alert" }
    recipient_type    { "role" }
    recipient_role    { "owner" }
    enabled           { true }

    trait :user_recipient do
      recipient_type { "user" }
      recipient_role { nil }
      association :recipient_user, factory: :user
      # The spec is responsible for creating an org membership for recipient_user
      # before validating, since the model checks org membership.
    end

    trait :token_alert do
      notification_type { "token_alert" }
    end

    trait :disabled do
      enabled { false }
    end
  end
end

FactoryBot.define do
  factory :notification do
    user
    organization
    notification_type { "cost_alert" }
    payload           { { alert_type: "cost_threshold" } }
    read_at           { nil }
  end
end

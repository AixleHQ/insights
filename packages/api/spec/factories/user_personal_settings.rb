FactoryBot.define do
  factory :user_personal_settings, class: "UserPersonalSettings" do
    user
    cost_threshold_cents { nil }
    token_threshold      { nil }
    alert_email          { true }
    alert_slack          { false }
    theme                { nil }
    timezone             { nil }
  end
end

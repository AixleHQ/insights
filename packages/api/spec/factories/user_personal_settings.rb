FactoryBot.define do
  factory :user_personal_settings, class: "UserPersonalSettings" do
    user
    alert_email { true }
    alert_slack { false }
  end
end

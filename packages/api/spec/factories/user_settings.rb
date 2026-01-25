FactoryBot.define do
  factory :user_setting do
    user
    sequence(:key) { |n| "setting_#{n}" }
    value { { enabled: true } }
  end
end

FactoryBot.define do
  factory :organization_setting do
    organization
    sequence(:key) { |n| "setting_#{n}" }
    value { { enabled: true } }
  end
end

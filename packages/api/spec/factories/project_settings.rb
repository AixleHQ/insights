FactoryBot.define do
  factory :project_setting do
    project
    sequence(:key) { |n| "setting_#{n}" }
    value { { enabled: true } }
  end
end

FactoryBot.define do
  factory :user_tool_account do
    organization_membership
    tool_name { 'claude_code' }
    external_user_id { SecureRandom.hex(8) }
    external_username { Faker::Internet.username }
    external_email { Faker::Internet.email }
    is_active { true }

    trait :cursor do
      tool_name { 'cursor' }
    end

    trait :github_copilot do
      tool_name { 'github_copilot' }
    end

    trait :inactive do
      is_active { false }
    end
  end
end

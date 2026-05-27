FactoryBot.define do
  factory :user_tool_account do
    organization_membership
    tool_name { 'claude_code' }
    external_user_id { SecureRandom.hex(8) }
    external_username { Faker::Internet.username }
    external_email { Faker::Internet.email }
    connection_state { nil }

    trait :cursor do
      tool_name { 'cursor' }
    end

    trait :github_copilot do
      tool_name { 'github_copilot' }
    end

    trait :inactive do
      connection_state { "inactive" }
    end

    trait :waiting_for_connection do
      connection_state { "waiting_for_connection" }
    end
  end
end

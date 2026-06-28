FactoryBot.define do
  factory :user_tool_account do
    organization_membership
    tool_name { 'claude_code' }
    external_user_id { SecureRandom.hex(8) }
    external_username { Faker::Internet.username }
    external_email { Faker::Internet.email }

    # connection_state is explicitly nil-ed (overriding the DB default of "inactive")
    # so that UserToolAccount#assign_default_connection_state — a before_validation
    # callback that only fires when the attribute is blank — can apply the correct
    # tool-aware default:
    #   - ingest tools (claude_code, cursor)  → "waiting_for_connection"
    #   - all other tools                     → "active"
    # Without this nil-out, the DB default ("inactive") would win and ingest tool
    # factories would not transition into the waiting state. Use one of the explicit
    # traits below when a test needs to lock the state.
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

    trait :active do
      connection_state { "active" }
    end

    trait :waiting_for_connection do
      connection_state { "waiting_for_connection" }
    end
  end
end

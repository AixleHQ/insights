FactoryBot.define do
  factory :tool_event do
    user
    organization
    project { nil }
    repository { nil }
    tool_name { 'claude_code' }
    event_type { 'chat' }
    model { 'claude-3-opus' }
    tokens_in { rand(100..1000) }
    tokens_out { rand(100..2000) }
    cost_usd { rand(0.001..0.1).round(6) }
    metadata { {} }
    occurred_at { Time.current }

    trait :with_project do
      project
    end

    trait :completion do
      event_type { 'completion' }
    end

    trait :edit do
      event_type { 'edit' }
    end
  end
end

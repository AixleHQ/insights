FactoryBot.define do
  factory :project_connector do
    project
    connector_type { 'anthropic' }
    external_org_id { SecureRandom.hex(8) }
    external_org_name { Faker::Company.name }
    is_active { true }
    status { 'connected' }

    trait :anthropic do
      connector_type { 'anthropic' }
    end

    trait :openai do
      connector_type { 'openai' }
    end

    trait :openrouter do
      connector_type { 'openrouter' }
    end

    trait :gemini do
      connector_type { 'gemini' }
    end

    trait :slack do
      connector_type { 'slack' }
      access_token { 'https://hooks.slack.com/services/T00000000/B00000000/EXAMPLE-WEBHOOK-SECRET' }
      external_org_name { '#general' }
      label { nil }
    end

    trait :inactive do
      is_active { false }
      status { 'disconnected' }
    end

    trait :with_error do
      status { 'error' }
      last_error { 'Invalid API key' }
    end

    trait :with_tokens do
      access_token { SecureRandom.hex(32) }
      token_expires_at { 1.hour.from_now }
    end
  end
end

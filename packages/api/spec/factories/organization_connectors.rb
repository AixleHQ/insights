FactoryBot.define do
  factory :organization_connector do
    organization
    connector_type { 'github' }
    external_org_id { SecureRandom.hex(8) }
    external_org_name { Faker::Company.name }
    is_active { true }

    trait :github do
      connector_type { 'github' }
    end

    trait :gitlab do
      connector_type { 'gitlab' }
    end

    trait :jira do
      connector_type { 'jira' }
    end

    trait :linear do
      connector_type { 'linear' }
    end

    trait :anthropic do
      connector_type { 'anthropic' }
      access_token { 'sk-ant-admin-test-key' }
    end

    trait :openrouter do
      connector_type { 'openrouter' }
      access_token { "or-#{SecureRandom.hex(24)}" }
      status { 'connected' }
    end

    trait :slack do
      connector_type { 'slack' }
      access_token { 'https://hooks.slack.com/services/T12345678/B12345678/EXAMPLE-WEBHOOK-SECRET' }
    end

    trait :inactive do
      is_active { false }
    end

    trait :github_copilot do
      connector_type { "github_copilot" }
      external_org_name { "acme-org" }
      access_token { SecureRandom.hex(32) }
    end

    trait :with_tokens do
      access_token { SecureRandom.hex(32) }
      refresh_token { SecureRandom.hex(32) }
      token_expires_at { 1.hour.from_now }
    end
  end
end

# frozen_string_literal: true

FactoryBot.define do
  factory :organization_audit_log do
    organization
    actor factory: :user
    action { "connector.create" }
    resource_type { "OrganizationConnector" }
    resource_id { SecureRandom.uuid }
    tracked_changes { { connector_type: "github" } }
    metadata { {} }
    severity { "info" }
    outcome { "success" }
    user_agent { Faker::Internet.user_agent }

    trait :settings_create do
      action { "settings.create" }
      resource_type { "OrganizationSetting" }
      tracked_changes { { key: "some_key", after: "some_value" } }
    end

    trait :settings_update do
      action { "settings.update" }
      resource_type { "OrganizationSetting" }
      tracked_changes { { key: "some_key", before: "old_value", after: "new_value" } }
    end

    trait :member_role_changed do
      action { "member.role_changed" }
      resource_type { "OrganizationMembership" }
      tracked_changes { { before: "member", after: "admin" } }
    end
  end
end

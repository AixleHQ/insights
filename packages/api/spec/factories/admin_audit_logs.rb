FactoryBot.define do
  factory :admin_audit_log do
    association :admin_user, factory: [ :user, :admin ]
    action { 'organizations#update' }
    resource_type { 'Organization' }
    resource_id { SecureRandom.uuid }
    ip_address { Faker::Internet.ip_v4_address }
    user_agent { Faker::Internet.user_agent }
    tracked_changes { { name: [ 'Old Name', 'New Name' ] } }
    metadata { {} }
  end
end

FactoryBot.define do
  factory :audit_log do
    organization
    raw_event_key { "events/#{SecureRandom.uuid}.json" }
    classification_labels { [] }
    risk_level { 'low' }
    confidence_score { 0.95 }
    sanitization_actions { [] }
    metadata { {} }

    trait :high_risk do
      risk_level { 'high' }
      classification_labels { %w[pii credentials] }
    end

    trait :none_risk do
      risk_level { 'none' }
    end

    trait :with_workflow do
      temporal_workflow_id { SecureRandom.uuid }
    end
  end
end

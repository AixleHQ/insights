FactoryBot.define do
  factory :event_text do
    tool_event_id { SecureRandom.uuid }
    occurred_at { Time.current }
    user_text { "Hello, how do I reverse a linked list?" }
    assistant_text { "Here's how you reverse a linked list..." }
    sanitized_at { Time.current }
    sanitizer_version { "v2" }
  end
end

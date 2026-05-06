# frozen_string_literal: true

FactoryBot.define do
  factory :model_pricing_override do
    association :organization
    model_pattern { "gpt-4o-ft-#{Faker::Alphanumeric.alpha(number: 6)}" }
    input_per_mtok  { 1.5 }
    output_per_mtok { 6.0 }
  end
end

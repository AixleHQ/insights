# frozen_string_literal: true

class ModelPricingOverrideSerializer < BaseSerializer
  attributes :id, :model_pattern

  attribute :input_per_mtok do |override|
    override.input_per_mtok.to_f
  end

  attribute :output_per_mtok do |override|
    override.output_per_mtok.to_f
  end

  timestamps
end

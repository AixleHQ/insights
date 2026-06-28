# frozen_string_literal: true

class ModelPricingOverride < ApplicationRecord
  belongs_to :organization

  validates :model_pattern,   presence: true
  validates :input_per_mtok,  presence: true, numericality: { greater_than: 0 }
  validates :output_per_mtok, presence: true, numericality: { greater_than: 0 }
  validates :model_pattern, uniqueness: { scope: :organization_id, case_sensitive: false,
                                          message: "already has a pricing override for this pattern" }
end

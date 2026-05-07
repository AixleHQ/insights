# frozen_string_literal: true

class CreateModelPricingOverrides < ActiveRecord::Migration[8.1]
  def change
    create_table :model_pricing_overrides, id: :uuid do |t|
      t.references :organization, null: false, foreign_key: true, type: :uuid
      t.string  :model_pattern,   null: false
      t.decimal :input_per_mtok,  precision: 10, scale: 6, null: false
      t.decimal :output_per_mtok, precision: 10, scale: 6, null: false

      t.timestamps
    end

    add_index :model_pricing_overrides, [ :organization_id, :model_pattern ], unique: true,
              name: "index_model_pricing_overrides_on_org_and_pattern"
  end
end

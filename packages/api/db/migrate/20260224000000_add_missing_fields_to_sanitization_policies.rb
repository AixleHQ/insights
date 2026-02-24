class AddMissingFieldsToSanitizationPolicies < ActiveRecord::Migration[8.1]
  def change
    add_column :sanitization_policies, :description, :text
    add_column :sanitization_policies, :pattern, :string
    add_column :sanitization_policies, :replacement, :string
    add_column :sanitization_policies, :is_global, :boolean, default: false, null: false
    add_column :sanitization_policies, :priority, :integer, default: 0, null: false
  end
end

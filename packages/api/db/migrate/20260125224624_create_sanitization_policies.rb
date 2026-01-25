class CreateSanitizationPolicies < ActiveRecord::Migration[8.1]
  def change
    create_table :sanitization_policies, id: :uuid do |t|
      t.integer :version, null: false
      t.string :name, null: false
      t.jsonb :classification_rules, default: {}
      t.jsonb :sanitization_rules, default: {}
      t.boolean :is_active, default: false, null: false
      t.datetime :effective_at

      t.timestamps
    end

    add_index :sanitization_policies, :version, unique: true
    add_index :sanitization_policies, :is_active, where: 'is_active = true'
  end
end

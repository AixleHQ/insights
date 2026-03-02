class CreateOrganizationSettings < ActiveRecord::Migration[8.1]
  def change
    create_table :organization_settings, id: :uuid do |t|
      t.references :organization, null: false, foreign_key: true, type: :uuid
      t.string :key, null: false
      t.jsonb :value, default: {}

      t.timestamps
    end

    add_index :organization_settings, [ :organization_id, :key ], unique: true
  end
end

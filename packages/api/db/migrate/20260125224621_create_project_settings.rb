class CreateProjectSettings < ActiveRecord::Migration[8.1]
  def change
    create_table :project_settings, id: :uuid do |t|
      t.references :project, null: false, foreign_key: true, type: :uuid
      t.string :key, null: false
      t.jsonb :value, default: {}

      t.timestamps
    end

    add_index :project_settings, [ :project_id, :key ], unique: true
  end
end

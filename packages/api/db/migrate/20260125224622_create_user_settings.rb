class CreateUserSettings < ActiveRecord::Migration[8.1]
  def change
    create_table :user_settings, id: :uuid do |t|
      t.references :user, null: false, foreign_key: true, type: :uuid
      t.string :key, null: false
      t.jsonb :value, default: {}

      t.timestamps
    end

    add_index :user_settings, [ :user_id, :key ], unique: true
  end
end

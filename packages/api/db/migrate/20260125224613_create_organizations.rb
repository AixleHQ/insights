class CreateOrganizations < ActiveRecord::Migration[8.1]
  def change
    create_table :organizations, id: :uuid do |t|
      t.string :name, null: false
      t.string :slug, null: false
      t.string :description
      t.boolean :is_active, default: true, null: false

      t.timestamps
    end

    add_index :organizations, :slug, unique: true
  end
end

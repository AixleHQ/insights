class CreateProjects < ActiveRecord::Migration[8.1]
  def change
    create_table :projects, id: :uuid do |t|
      t.references :organization, foreign_key: true, type: :uuid
      t.references :owner, foreign_key: { to_table: :users }, type: :uuid
      t.string :name, null: false
      t.string :slug, null: false
      t.string :description
      t.boolean :is_active, default: true, null: false

      t.timestamps
    end

    add_index :projects, [:organization_id, :slug], unique: true, where: 'organization_id IS NOT NULL'
    add_index :projects, [:owner_id, :slug], unique: true, where: 'owner_id IS NOT NULL'
  end
end

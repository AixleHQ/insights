class CreateRepositories < ActiveRecord::Migration[8.1]
  def change
    create_table :repositories, id: :uuid do |t|
      t.references :project, null: false, foreign_key: true, type: :uuid
      t.references :organization_connector, null: false, foreign_key: true, type: :uuid
      t.string :external_id, null: false
      t.string :name, null: false
      t.string :full_name, null: false
      t.string :url
      t.string :default_branch
      t.boolean :is_private, default: false
      t.datetime :last_sync_at

      t.timestamps
    end

    add_index :repositories, [:organization_connector_id, :external_id], unique: true, name: 'idx_repositories_connector_external'
  end
end

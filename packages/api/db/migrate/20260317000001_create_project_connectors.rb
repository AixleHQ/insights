class CreateProjectConnectors < ActiveRecord::Migration[8.0]
  def change
    create_table :project_connectors, id: :uuid do |t|
      t.references :project, null: false, foreign_key: true, type: :uuid
      t.column :connector_type, :connector_type, null: false
      t.text :access_token
      t.text :refresh_token
      t.datetime :token_expires_at
      t.text :scopes, array: true, default: []
      t.text :webhook_secret
      t.jsonb :config, default: {}
      t.boolean :is_active, default: true, null: false
      t.string :external_org_id
      t.string :external_org_name
      t.string :status, default: "connected", null: false
      t.datetime :last_sync_at
      t.string :last_error
      t.timestamps
    end

    add_index :project_connectors, [ :project_id, :connector_type ], unique: true
  end
end

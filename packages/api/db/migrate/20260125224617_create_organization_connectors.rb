class CreateOrganizationConnectors < ActiveRecord::Migration[8.1]
  def change
    create_table :organization_connectors, id: :uuid do |t|
      t.references :organization, null: false, foreign_key: true, type: :uuid
      t.column :connector_type, :connector_type, null: false
      t.string :external_org_id
      t.string :external_org_name
      t.text :access_token
      t.text :refresh_token
      t.datetime :token_expires_at
      t.text :scopes, array: true, default: []
      t.string :webhook_secret
      t.jsonb :config, default: {}
      t.boolean :is_active, default: true, null: false
      t.datetime :last_sync_at
      t.string :last_error

      t.timestamps
    end

    add_index :organization_connectors, [:organization_id, :connector_type], unique: true
  end
end

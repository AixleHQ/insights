# frozen_string_literal: true

class CreateWebhookDeliveries < ActiveRecord::Migration[8.1]
  def change
    create_table :webhook_deliveries, id: :uuid do |t|
      t.references :organization_connector, null: false, foreign_key: true, type: :uuid

      t.string :provider,       null: false
      t.string :event_type,     null: false
      t.string :raw_event_key,  null: false
      t.string :status,         null: false, default: "pending"
      t.integer :attempts,      null: false, default: 0
      t.datetime :last_attempted_at
      t.string :last_error
      t.datetime :delivered_at

      t.timestamps
    end

    add_index :webhook_deliveries, [ :organization_connector_id, :status ]
    add_index :webhook_deliveries, [ :organization_connector_id, :created_at ]
  end
end

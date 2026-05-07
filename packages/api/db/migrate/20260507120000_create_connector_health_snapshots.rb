# frozen_string_literal: true

class CreateConnectorHealthSnapshots < ActiveRecord::Migration[8.1]
  def change
    create_table :connector_health_snapshots, id: :uuid do |t|
      t.references :organization_connector, null: false, foreign_key: true, type: :uuid

      t.string   :status,          null: false
      t.integer  :sync_duration_ms
      t.text     :error_message
      t.datetime :snapshotted_at,  null: false

      t.timestamps
    end

    add_check_constraint :connector_health_snapshots,
      "status IN ('success', 'failure')",
      name: "connector_health_snapshots_status_check"

    add_index :connector_health_snapshots,
      [ :organization_connector_id, :snapshotted_at ]
    add_index :connector_health_snapshots, :snapshotted_at
  end
end

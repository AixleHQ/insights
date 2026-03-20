# frozen_string_literal: true

class CreateProjectAuditLogs < ActiveRecord::Migration[8.0]
  def change
    create_table :project_audit_logs, id: :uuid, default: -> { "gen_random_uuid()" } do |t|
      t.references :project, null: false, foreign_key: true, type: :uuid
      t.references :actor, null: true, foreign_key: { to_table: :users }, type: :uuid
      t.string :action, null: false
      t.string :resource_type
      t.uuid :resource_id
      t.jsonb :tracked_changes, null: false, default: {}
      t.jsonb :metadata, null: false, default: {}
      t.string :ip_address
      t.datetime :created_at, null: false, default: -> { "CURRENT_TIMESTAMP" }
    end

    add_index :project_audit_logs, :action
    add_index :project_audit_logs, :resource_type
    add_index :project_audit_logs, [ :resource_type, :resource_id ]
    add_index :project_audit_logs, :created_at
  end
end

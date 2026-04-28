class CreateAdminAuditLogs < ActiveRecord::Migration[8.1]
  def change
    create_table :admin_audit_logs, id: :uuid do |t|
      t.references :admin_user, null: false, foreign_key: { to_table: :users }, type: :uuid
      t.string :action, null: false
      t.string :resource_type, null: false
      t.uuid :resource_id
      t.string :ip_address
      t.string :user_agent
      t.jsonb :tracked_changes, default: {}
      t.jsonb :metadata, default: {}

      t.datetime :created_at, null: false
    end

    add_index :admin_audit_logs, [ :resource_type, :resource_id ]
    add_index :admin_audit_logs, :created_at
  end
end

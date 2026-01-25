class CreateAuditLogs < ActiveRecord::Migration[8.1]
  def change
    create_table :audit_logs, id: :uuid do |t|
      t.uuid :tool_event_id
      t.string :raw_event_key, null: false
      t.references :organization, null: false, foreign_key: true, type: :uuid
      t.text :classification_labels, array: true, default: []
      t.column :risk_level, :risk_level, null: false, default: 'low'
      t.decimal :confidence_score, precision: 5, scale: 4
      t.text :sanitization_actions, array: true, default: []
      t.references :policy_version, foreign_key: { to_table: :sanitization_policies }, type: :uuid
      t.string :temporal_workflow_id
      t.jsonb :metadata, default: {}

      t.datetime :created_at, null: false
    end

    add_index :audit_logs, :tool_event_id
    add_index :audit_logs, :raw_event_key
    add_index :audit_logs, :temporal_workflow_id
  end
end

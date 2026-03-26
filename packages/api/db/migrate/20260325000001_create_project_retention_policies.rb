class CreateProjectRetentionPolicies < ActiveRecord::Migration[8.0]
  def change
    create_table :project_retention_policies, id: :uuid do |t|
      t.references :project, null: false, foreign_key: true, type: :uuid, index: { unique: true }
      t.references :updated_by, foreign_key: { to_table: :users }, type: :uuid, null: true
      t.column :raw_event_ttl, :raw_event_ttl, null: false, default: "24_hours"
      t.column :tool_events_retention, :tool_events_retention, null: false, default: "90_days"
      t.column :hourly_aggregate_retention, :hourly_aggregate_retention, null: false, default: "365_days"
      t.column :daily_aggregate_retention, :daily_aggregate_retention, null: false, default: "forever"
      t.string :retention_reason
      t.timestamps
    end

    reversible do |dir|
      dir.up do
        execute <<~SQL
          INSERT INTO project_retention_policies (id, project_id, created_at, updated_at)
          SELECT gen_random_uuid(), id, NOW(), NOW()
          FROM projects
          WHERE id NOT IN (SELECT project_id FROM project_retention_policies)
        SQL
      end
    end
  end
end

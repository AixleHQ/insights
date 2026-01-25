class CreateOrganizationRetentionPolicies < ActiveRecord::Migration[8.1]
  def change
    create_table :organization_retention_policies, id: :uuid do |t|
      t.references :organization, null: false, foreign_key: true, type: :uuid, index: { unique: true }
      t.column :raw_event_ttl, :raw_event_ttl, null: false, default: '24_hours'
      t.column :tool_events_retention, :tool_events_retention, null: false, default: '90_days'
      t.column :hourly_aggregate_retention, :hourly_aggregate_retention, null: false, default: '365_days'
      t.column :daily_aggregate_retention, :daily_aggregate_retention, null: false, default: 'forever'
      t.string :retention_reason
      t.references :updated_by, foreign_key: { to_table: :users }, type: :uuid

      t.timestamps
    end
  end
end

# frozen_string_literal: true

class CreateRetentionPurgeLogs < ActiveRecord::Migration[8.1]
  def up
    create_table :retention_purge_logs do |t|
      t.references :organization, null: false, foreign_key: true, type: :uuid
      t.references :project, null: true, foreign_key: true, type: :uuid
      t.integer :retention_policy_type, null: false
      t.integer :retention_days_applied, null: false
      t.datetime :cutoff_timestamp, null: false
      t.integer :records_deleted, null: false, default: 0
      t.datetime :job_run_at, null: false
      t.integer :status, null: false, default: 0
      t.text :error_message

      t.timestamps
    end

    add_index :retention_purge_logs, :job_run_at

    execute <<~SQL
      CREATE FUNCTION prevent_retention_purge_log_mutation()
      RETURNS TRIGGER AS $$
      BEGIN
        RAISE EXCEPTION 'retention_purge_logs is append-only — updates and deletes are not permitted';
      END;
      $$ LANGUAGE plpgsql;

      CREATE TRIGGER retention_purge_logs_append_only
      BEFORE UPDATE OR DELETE ON retention_purge_logs
      FOR EACH ROW EXECUTE FUNCTION prevent_retention_purge_log_mutation();
    SQL
  end

  def down
    execute "DROP TRIGGER IF EXISTS retention_purge_logs_append_only ON retention_purge_logs;"
    execute "DROP FUNCTION IF EXISTS prevent_retention_purge_log_mutation();"
    drop_table :retention_purge_logs
  end
end

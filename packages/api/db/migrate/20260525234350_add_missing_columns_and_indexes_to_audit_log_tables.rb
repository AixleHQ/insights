# frozen_string_literal: true

class AddMissingColumnsAndIndexesToAuditLogTables < ActiveRecord::Migration[8.1]
  disable_ddl_transaction!

  def up
    # Pass 1 — charset filter: null out obvious non-IP values (forwarded chains, "unknown", etc.)
    %w[organization_audit_logs project_audit_logs admin_audit_logs].each do |table|
      execute "UPDATE #{table} SET ip_address = NULL WHERE ip_address IS NOT NULL AND ip_address !~ '^[0-9a-fA-F:.]+$'"
    end

    # Pass 2 — safe cast: null out values that pass the charset but fail the actual inet cast
    # (e.g. 999.999.999.999 passes the regex but is not a valid inet address)
    execute <<-SQL
      CREATE OR REPLACE FUNCTION safe_text_to_inet(t text) RETURNS inet AS $$
      BEGIN
        RETURN t::inet;
      EXCEPTION WHEN invalid_text_representation OR OTHERS THEN
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql IMMUTABLE STRICT;
    SQL
    %w[organization_audit_logs project_audit_logs admin_audit_logs].each do |table|
      execute "UPDATE #{table} SET ip_address = NULL WHERE ip_address IS NOT NULL AND safe_text_to_inet(ip_address) IS NULL"
    end

    # Change ip_address from string to inet on all three tables
    change_column :organization_audit_logs, :ip_address, :inet, using: "ip_address::inet"
    change_column :project_audit_logs,      :ip_address, :inet, using: "ip_address::inet"
    change_column :admin_audit_logs,        :ip_address, :inet, using: "ip_address::inet"

    # OrganizationAuditLog — missing columns
    add_column :organization_audit_logs, :user_agent, :string
    add_column :organization_audit_logs, :severity,   :string
    add_column :organization_audit_logs, :outcome,    :string

    # ProjectAuditLog — missing columns
    add_column :project_audit_logs, :user_agent, :string
    add_column :project_audit_logs, :severity,   :string
    add_column :project_audit_logs, :outcome,    :string

    # AdminAuditLog — ip_address and user_agent already exist; add severity and outcome
    add_column :admin_audit_logs, :severity, :string
    add_column :admin_audit_logs, :outcome,  :string

    # Composite indexes for efficient pagination
    execute <<-SQL
      CREATE INDEX CONCURRENTLY IF NOT EXISTS index_organization_audit_logs_on_org_id_and_created_at
        ON organization_audit_logs (organization_id, created_at DESC);
    SQL
    execute <<-SQL
      CREATE INDEX CONCURRENTLY IF NOT EXISTS index_project_audit_logs_on_project_id_and_created_at
        ON project_audit_logs (project_id, created_at DESC);
    SQL
    execute <<-SQL
      CREATE INDEX CONCURRENTLY IF NOT EXISTS index_admin_audit_logs_on_created_at_desc
        ON admin_audit_logs (created_at DESC);
    SQL

    # Drop the migration-only helper function
    execute "DROP FUNCTION IF EXISTS safe_text_to_inet(text)"
  end

  def down
    execute "DROP INDEX CONCURRENTLY IF EXISTS index_organization_audit_logs_on_org_id_and_created_at"
    execute "DROP INDEX CONCURRENTLY IF EXISTS index_project_audit_logs_on_project_id_and_created_at"
    execute "DROP INDEX CONCURRENTLY IF EXISTS index_admin_audit_logs_on_created_at_desc"

    remove_column :organization_audit_logs, :user_agent
    remove_column :organization_audit_logs, :severity
    remove_column :organization_audit_logs, :outcome

    remove_column :project_audit_logs, :user_agent
    remove_column :project_audit_logs, :severity
    remove_column :project_audit_logs, :outcome

    remove_column :admin_audit_logs, :severity
    remove_column :admin_audit_logs, :outcome

    change_column :organization_audit_logs, :ip_address, :string, using: "ip_address::text"
    change_column :project_audit_logs,      :ip_address, :string, using: "ip_address::text"
    change_column :admin_audit_logs,        :ip_address, :string, using: "ip_address::text"

    execute "DROP FUNCTION IF EXISTS safe_text_to_inet(text)"
  end
end

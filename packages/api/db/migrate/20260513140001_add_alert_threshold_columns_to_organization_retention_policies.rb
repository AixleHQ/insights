class AddAlertThresholdColumnsToOrganizationRetentionPolicies < ActiveRecord::Migration[8.1]
  def change
    add_column :organization_retention_policies, :cost_threshold_cents, :integer
    add_column :organization_retention_policies, :token_threshold, :integer
    add_column :organization_retention_policies, :alert_enabled, :boolean, default: true, null: false
  end
end

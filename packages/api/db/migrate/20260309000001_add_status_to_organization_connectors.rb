# frozen_string_literal: true

class AddStatusToOrganizationConnectors < ActiveRecord::Migration[8.0]
  def up
    add_column :organization_connectors, :status, :string, null: false, default: "connected"
    add_index :organization_connectors, :status

    # Backfill status from existing is_active + last_error fields
    execute <<~SQL
      UPDATE organization_connectors
      SET status = CASE
        WHEN is_active = false THEN 'disconnected'
        WHEN last_error IS NOT NULL THEN 'error'
        ELSE 'connected'
      END
    SQL
  end

  def down
    remove_index :organization_connectors, :status
    remove_column :organization_connectors, :status
  end
end

# frozen_string_literal: true

class AddActivitySyncStartedAtToOrganizationConnectors < ActiveRecord::Migration[8.1]
  def change
    add_column :organization_connectors, :activity_sync_started_at, :datetime
  end
end

# frozen_string_literal: true

# Adds a dedicated timestamp for when a connector entered the `testing` state so
# stuck-sync detection (AIX-628) has a reliable clock instead of `updated_at`,
# which any unrelated write would reset.
class AddTestingStartedAtToOrganizationConnectors < ActiveRecord::Migration[8.1]
  def change
    add_column :organization_connectors, :testing_started_at, :timestamp
  end
end

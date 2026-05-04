# frozen_string_literal: true

class AddPendingActivityJobsToOrganizationConnectors < ActiveRecord::Migration[8.1]
  def change
    add_column :organization_connectors, :pending_activity_jobs, :integer
  end
end

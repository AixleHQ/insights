# frozen_string_literal: true

class AddIssuesSyncedAtToProjects < ActiveRecord::Migration[8.1]
  def change
    add_column :projects, :issues_synced_at, :datetime
  end
end

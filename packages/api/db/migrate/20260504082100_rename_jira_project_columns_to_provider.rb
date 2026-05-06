# frozen_string_literal: true

class RenameJiraProjectColumnsToProvider < ActiveRecord::Migration[8.1]
  def change
    rename_column :issues, :jira_project_key, :provider_project_key
    rename_column :issues, :jira_project_id,  :provider_project_id
  end
end

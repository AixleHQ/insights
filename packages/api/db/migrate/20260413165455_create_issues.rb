# frozen_string_literal: true

class CreateIssues < ActiveRecord::Migration[8.1]
  def change
    create_table :issues, id: :uuid do |t|
      t.references :organization,           null: false, foreign_key: true, type: :uuid
      t.references :project,                null: true,  foreign_key: true, type: :uuid
      t.references :organization_connector, null: false, foreign_key: true, type: :uuid
      t.references :assignee, foreign_key: { to_table: :users }, null: true, type: :uuid

      t.string  :external_id,        null: false
      t.string  :key,                null: false
      t.string  :summary,            null: false
      t.text    :description
      t.string  :status
      t.string  :status_category
      t.string  :issue_type
      t.string  :priority
      t.string  :jira_project_key,   null: false
      t.string  :jira_project_id,    null: false
      t.string  :assignee_account_id
      t.string  :assignee_name
      t.string  :reporter_name
      t.string  :parent_key
      t.text    :labels, array: true, default: []
      t.date    :due_date
      t.jsonb   :metadata, default: {}
      t.datetime :external_created_at
      t.datetime :external_updated_at
      t.datetime :synced_at

      t.timestamps
    end

    add_index :issues, [ :organization_connector_id, :external_id ], unique: true
    add_index :issues, [ :project_id, :status ]
    add_index :issues, [ :organization_id, :external_updated_at ]
    add_index :issues, :key
  end
end

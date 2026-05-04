# frozen_string_literal: true

class ReplaceIssuesUniqueIndexWithComposite < ActiveRecord::Migration[8.1]
  def up
    remove_index :issues, name: "index_issues_on_organization_connector_id_and_external_id"
    add_index :issues, %i[organization_connector_id project_id external_id],
              unique: true,
              name: "index_issues_on_connector_project_external_id"
  end

  def down
    remove_index :issues, name: "index_issues_on_connector_project_external_id"
    add_index :issues, %i[organization_connector_id external_id],
              unique: true,
              name: "index_issues_on_organization_connector_id_and_external_id"
  end
end

# frozen_string_literal: true

class AllowMultipleSlackProjectConnectors < ActiveRecord::Migration[8.1]
  MULTI_INSTANCE_TYPES = %w[slack].freeze

  def up
    remove_index :project_connectors,
                 name: "index_project_connectors_on_project_id_and_connector_type"

    quoted = MULTI_INSTANCE_TYPES.map { |t| connection.quote(t) }.join(", ")
    execute <<~SQL
      CREATE UNIQUE INDEX idx_project_connectors_single_instance
        ON project_connectors (project_id, connector_type)
        WHERE connector_type NOT IN (#{quoted})
    SQL

    add_column :project_connectors, :label, :string
  end

  def down
    if multi_instance_duplicates_exist?
      raise ActiveRecord::IrreversibleMigration,
            "Cannot rollback: multiple Slack connectors exist for at least one project."
    end

    remove_column :project_connectors, :label

    execute "DROP INDEX IF EXISTS idx_project_connectors_single_instance"

    add_index :project_connectors, %i[project_id connector_type], unique: true,
              name: "index_project_connectors_on_project_id_and_connector_type"
  end

  private

  def multi_instance_duplicates_exist?
    values = MULTI_INSTANCE_TYPES.map { |type| connection.quote(type) }.join(", ")
    sql = <<~SQL.squish
      SELECT 1
      FROM project_connectors
      WHERE connector_type IN (#{values})
      GROUP BY project_id, connector_type
      HAVING COUNT(*) > 1
      LIMIT 1
    SQL
    connection.select_value(sql).present?
  end
end

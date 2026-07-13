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
    delete_multi_instance_duplicates

    remove_column :project_connectors, :label

    execute "DROP INDEX IF EXISTS idx_project_connectors_single_instance"

    add_index :project_connectors, %i[project_id connector_type], unique: true,
              name: "index_project_connectors_on_project_id_and_connector_type"
  end

  private

  # Keep the oldest connector per (project_id, connector_type) pair and delete the rest.
  def delete_multi_instance_duplicates
    values = MULTI_INSTANCE_TYPES.map { |type| connection.quote(type) }.join(", ")
    execute <<~SQL
      DELETE FROM project_connectors
      WHERE connector_type IN (#{values})
        AND id NOT IN (
          SELECT DISTINCT ON (project_id, connector_type) id
          FROM project_connectors
          WHERE connector_type IN (#{values})
          ORDER BY project_id, connector_type, created_at ASC
        )
    SQL
  end
end

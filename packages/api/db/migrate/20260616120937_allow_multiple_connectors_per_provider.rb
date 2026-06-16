# frozen_string_literal: true

class AllowMultipleConnectorsPerProvider < ActiveRecord::Migration[8.1]
  # Types that allow more than one connector per org.
  # Must stay in sync with OrganizationConnector::MULTI_INSTANCE_CONNECTOR_TYPES.
  MULTI_INSTANCE_TYPES = %w[github gitlab bitbucket jira linear openrouter openai].freeze

  def up
    # 1. Drop the old blanket unique index.
    remove_index :organization_connectors, name: "idx_on_organization_id_connector_type_ebd5fb8c77"

    # 2. Partial unique index: single-instance types still get exactly one row per org.
    execute <<~SQL
      CREATE UNIQUE INDEX idx_org_connectors_single_instance
        ON organization_connectors (organization_id, connector_type)
        WHERE connector_type NOT IN (#{MULTI_INSTANCE_TYPES.map { |t| "'#{t}'" }.join(", ")})
    SQL

    # 3. Partial unique index: OAuth dedup — same account cannot be connected twice.
    #    openrouter / openai have NULL external_org_id so they are excluded by the WHERE clause.
    execute <<~SQL
      CREATE UNIQUE INDEX idx_org_connectors_oauth_dedup
        ON organization_connectors (organization_id, connector_type, external_org_id)
        WHERE external_org_id IS NOT NULL
    SQL

    # 4. Label column for user-supplied disambiguation.
    add_column :organization_connectors, :label, :string
  end

  def down
    remove_column :organization_connectors, :label

    execute "DROP INDEX IF EXISTS idx_org_connectors_oauth_dedup"
    execute "DROP INDEX IF EXISTS idx_org_connectors_single_instance"

    # Restore original blanket unique index.
    add_index :organization_connectors, %i[organization_id connector_type],
              unique: true, name: "idx_on_organization_id_connector_type_ebd5fb8c77"
  end
end

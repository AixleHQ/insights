# frozen_string_literal: true

# Plain (non-hypertable) deduplication table for connector-sourced tool events.
#
# TimescaleDB hypertables require UNIQUE indexes to include the partition column
# (occurred_at), which makes application-level dedup the only option on tool_events
# itself. This table solves that: it is a regular PostgreSQL table so a proper
# UNIQUE constraint works, enabling INSERT ... ON CONFLICT for both single-row
# (webhook) and batch (bulk sync) paths.
#
# No FK to timeseries.tool_events intentionally — cross-schema FK adds overhead
# and the dedup table is allowed to outlive individual hypertable chunks.
class CreateConnectorEventDedup < ActiveRecord::Migration[8.1]
  def change
    create_table :connector_event_dedup, id: :bigserial do |t|
      t.uuid   :organization_id, null: false
      t.string :tool_name,       null: false
      t.string :event_type,      null: false
      t.string :unique_key,      null: false
      t.string :unique_value,    null: false
      t.uuid   :tool_event_id,   null: false
      t.timestamptz :updated_at, null: false, default: -> { "NOW()" }
    end

    add_index :connector_event_dedup,
              %i[organization_id tool_name event_type unique_key unique_value],
              unique: true,
              name: "idx_connector_event_dedup_lookup"

    add_index :connector_event_dedup, :tool_event_id,
              name: "idx_connector_event_dedup_event_id"
  end
end

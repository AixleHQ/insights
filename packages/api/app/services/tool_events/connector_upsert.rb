# frozen_string_literal: true

module ToolEvents
  # Idempotent create/update for a single connector-sourced tool_event (webhooks).
  #
  # Used for one-off events: GitLab/Bitbucket/Linear webhooks where a single
  # record arrives at a time. For bulk syncs (hundreds of issues/MRs) use
  # ToolEvents::BatchConnectorUpsert instead.
  #
  # Deduplication strategy:
  #   1. Attempt INSERT into connector_event_dedup ON CONFLICT DO NOTHING.
  #      If the row is new → insert the ToolEvent and backfill tool_event_id.
  #      If the row already exists → load it and UPDATE the existing ToolEvent.
  #
  # No advisory lock needed: the UNIQUE constraint on connector_event_dedup
  # serialises concurrent inserts at the DB layer (ON CONFLICT). The worst case
  # is two concurrent writes for the same key both see "no existing row", race
  # to INSERT into connector_event_dedup, and one wins via the unique constraint.
  # The loser re-reads the winner's row and falls through to the update branch.
  class ConnectorUpsert
    IMMUTABLE_LOOKUP_FIELDS = %i[organization_id repository_id tool_name event_type occurred_at].freeze

    def self.call(unique_key:, unique_value:, **attributes)
      new(unique_key:, unique_value:, attributes: attributes.deep_symbolize_keys).call
    end

    def initialize(unique_key:, unique_value:, attributes:)
      @unique_key   = unique_key.to_s
      @unique_value = unique_value.to_s
      @attributes   = attributes
    end

    def call
      dedup_attributes = {
        organization_id: @attributes[:organization_id],
        tool_name:        @attributes[:tool_name].to_s,
        event_type:       @attributes[:event_type].to_s,
        unique_key:       @unique_key,
        unique_value:     @unique_value
      }

      ToolEvent.transaction do
        # Optimistically try to claim the dedup slot with a placeholder event_id.
        # We'll backfill the real event_id immediately after creating the ToolEvent.
        #
        # NOTE: Rails upsert with on_duplicate: :skip on Rails 8+ may include `id`
        # in the SET clause as EXCLUDED.id which is NULL (bigserial not passed in
        # the hash), causing a NOT NULL violation. Use raw SQL INSERT ... ON CONFLICT
        # DO NOTHING RETURNING to avoid touching the id column entirely.
        conn = ConnectorEventDedup.connection
        row  = dedup_attributes.merge(
          tool_event_id: "00000000-0000-0000-0000-000000000000",
          updated_at: Time.current
        )
        conflict_cols = %w[organization_id tool_name event_type unique_key unique_value]
          .map { |c| conn.quote_column_name(c) }.join(", ")
        col_names = row.keys.map { |k| conn.quote_column_name(k) }.join(", ")
        values    = row.values.map { |v| v.nil? ? "NULL" : conn.quote(v) }.join(", ")

        sql_template = "INSERT INTO %s (%s) VALUES (%s) ON CONFLICT (%s) DO NOTHING RETURNING id, tool_event_id"
        sql = format(sql_template, ConnectorEventDedup.quoted_table_name, col_names, values, conflict_cols)

        result = conn.execute(sql)

        existing_event_id = result.first&.fetch("tool_event_id", nil)

        # Re-read the row if ON CONFLICT DO NOTHING fired and returned nothing.
        if existing_event_id.nil?
          existing_event_id = ConnectorEventDedup.find_by(dedup_attributes)&.tool_event_id
        end

        if existing_event_id.nil? || existing_event_id == "00000000-0000-0000-0000-000000000000"
          # New dedup row — create the ToolEvent then update the placeholder.
          event = ToolEvent.create!(@attributes)
          ConnectorEventDedup
            .where(dedup_attributes)
            .update_all(tool_event_id: event.id, updated_at: Time.current)
          event
        else
          # Existing event — update mutable fields.
          event = ToolEvent.find_by(id: existing_event_id)
          event&.update!(mutable_attributes)
          ToolEvents::AutoMembershipService.call(event) if event
          event
        end
      end
    end

    private

    def mutable_attributes
      @attributes.except(*IMMUTABLE_LOOKUP_FIELDS)
    end
  end
end

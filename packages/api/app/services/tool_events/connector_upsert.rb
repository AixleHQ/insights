# frozen_string_literal: true

module ToolEvents
  # Idempotent create/update for connector-sourced tool_events (GitLab, Bitbucket, Linear, …),
  # keyed by a stable field inside +metadata+ (e.g. +sha+, +mr_iid+, +pipeline_id+).
  #
  # Race safety: two concurrent webhook deliveries must not both pass a find and insert duplicates.
  # TimescaleDB hypertables require UNIQUE indexes to include the partition column (+occurred_at+); see
  # db/migrate/20260424000003_add_session_id_index_to_tool_events.rb and +ToolEvents::Upsert+.
  # We therefore serialize conflicting writers with +pg_advisory_xact_lock+ inside a transaction,
  # same pattern as session deduplication.
  class ConnectorUpsert
    IMMUTABLE_LOOKUP_FIELDS = %i[organization_id repository_id tool_name event_type].freeze

    def self.call(unique_key:, unique_value:, **attributes)
      new(unique_key:, unique_value:, attributes: attributes.deep_symbolize_keys).call
    end

    def initialize(unique_key:, unique_value:, attributes:)
      @unique_key = unique_key.to_s
      @unique_value = unique_value.to_s
      @attributes = attributes
    end

    def call
      ToolEvent.transaction do
        advisory_xact_lock!

        existing = ToolEvent
          .where(
            organization_id: @attributes[:organization_id],
            repository_id: @attributes[:repository_id],
            tool_name: @attributes[:tool_name],
            event_type: @attributes[:event_type]
          )
          .where("metadata ->> ? = ?", @unique_key, @unique_value)
          .order(occurred_at: :desc)
          .first

        if existing
          existing.update!(mutable_attributes)
        else
          ToolEvent.create!(@attributes)
        end
      end
    end

    private

    def advisory_xact_lock!
      seed = [
        @attributes[:organization_id],
        @attributes[:repository_id].presence,
        @attributes[:tool_name],
        @attributes[:event_type],
        @unique_key,
        @unique_value
      ].join("\x1f")

      lock_key = Zlib.crc32(seed)
      ToolEvent.connection.execute("SELECT pg_advisory_xact_lock(#{Integer(lock_key)})")
    end

    def mutable_attributes
      @attributes.except(*IMMUTABLE_LOOKUP_FIELDS)
    end
  end
end

# frozen_string_literal: true

module ToolEvents
  # Creates or updates a tool_event, deduplicating on session_id.
  #
  # Context: db90-claude (the CLI connector) re-sends a session when its JSONL
  # transcript file grows. Each re-send should UPDATE the existing record (with
  # the latest aggregated token counts) rather than create a new row. Without
  # this, the Events page accumulates duplicate rows that inflate apparent cost.
  #
  # TimescaleDB constraint: UNIQUE indexes on hypertables must include the
  # partition column (occurred_at). Since occurred_at must not change after
  # creation, we enforce uniqueness here at the application layer instead.
  #
  # Race-condition safety: pg_advisory_xact_lock serialises concurrent requests
  # for the same session_id, eliminating the TOCTOU window in the naive
  # find-then-insert approach.
  class Upsert
    MUTABLE_FIELDS = %i[
      tokens_in tokens_out tokens_total cost_usd
      model duration_ms project_id metadata
    ].freeze

    # @return [Hash] { tool_event: ToolEvent, created: Boolean }
    def self.call(attributes)
      new(attributes).call
    end

    def initialize(attributes)
      @attributes = attributes
      @session_id = attributes.dig(:metadata, "session_id") ||
                    attributes.dig(:metadata, :session_id)
    end

    def call
      if @session_id.present?
        upsert_with_lock
      else
        event = ToolEvent.create!(@attributes)
        { tool_event: event, created: true }
      end
    end

    private

    def upsert_with_lock
      ToolEvent.transaction do
        # Advisory lock auto-released at transaction end — serialises concurrent
        # requests for the same session_id to eliminate the TOCTOU window.
        lock_key = Zlib.crc32(@session_id)
        ToolEvent.connection.exec_query(
          "SELECT pg_advisory_xact_lock($1)",
          "advisory_lock",
          [ lock_key ]
        )

        existing = ToolEvent
          .where(organization_id: @attributes[:organization_id])
          .where("metadata->>'session_id' = ?", @session_id)
          .first

        if existing
          existing.update!(mutable_attributes)
          { tool_event: existing, created: false }
        else
          event = ToolEvent.create!(@attributes)
          { tool_event: event, created: true }
        end
      end
    end

    def mutable_attributes
      @attributes.slice(*MUTABLE_FIELDS)
    end
  end
end

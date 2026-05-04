# frozen_string_literal: true

module ToolEvents
  # Bulk idempotent upsert for connector-sourced tool_events.
  #
  # Replaces the per-row ConnectorUpsert loop for bulk syncs (Linear issues,
  # GitLab MRs, Bitbucket pipelines, etc.). Reduces N×5 sequential DB round-trips
  # to 3 statements regardless of batch size:
  #
  #   1. SELECT existing dedup rows for the batch.
  #   2. INSERT tool_events for new records only (ignore already-seen keys).
  #   3. INSERT/UPDATE connector_event_dedup to record new key→event_id mappings.
  #      Existing rows are updated with the latest mutable attributes directly.
  #
  # Race-condition safety:
  #   Two concurrent bulk syncs for the same connector may overlap. The UNIQUE
  #   constraint on connector_event_dedup handles the conflict: whichever job wins
  #   the INSERT owns the row; the loser's subsequent SELECT picks up the winner's
  #   event_id and skips re-insertion.
  #
  # Usage:
  #   ToolEvents::BatchConnectorUpsert.call(
  #     unique_key:      "issue_snapshot_id",
  #     records: [
  #       { unique_value: "LIN-123", organization_id: ..., tool_name: "linear", ... },
  #       ...
  #     ]
  #   )
  class BatchConnectorUpsert
    IMMUTABLE_LOOKUP_FIELDS = %i[organization_id repository_id tool_name event_type].freeze

    def self.call(unique_key:, records:)
      new(unique_key:, records:).call
    end

    def initialize(unique_key:, records:)
      @unique_key = unique_key.to_s
      @records    = records.map { |r| r.deep_symbolize_keys }
    end

    def call # rubocop:disable Metrics/MethodLength
      return if @records.empty?

      # --- Step 1: find already-deduped keys in one query ---
      sample      = @records.first
      org_id      = sample[:organization_id]
      tool_name   = sample[:tool_name].to_s
      event_type  = sample[:event_type].to_s
      unique_vals = @records.map { |r| r[:unique_value].to_s }

      existing_map = ConnectorEventDedup
        .where(
          organization_id: org_id,
          tool_name:        tool_name,
          event_type:       event_type,
          unique_key:       @unique_key,
          unique_value:     unique_vals
        )
        .pluck(:unique_value, :tool_event_id)
        .to_h

      new_records      = @records.reject { |r| existing_map.key?(r[:unique_value].to_s) }
      existing_records = @records.select { |r| existing_map.key?(r[:unique_value].to_s) }

      now = Time.current

      # --- Step 2: bulk-insert new ToolEvents ---
      unless new_records.empty?
        event_rows = new_records.map do |r|
          r.except(:unique_value)
           .merge(id: SecureRandom.uuid, created_at: now)
        end

        bulk_insert_tool_events(event_rows)

        # Re-query to get IDs (raw INSERT doesn't return records on hypertables).
        # Arel.sql is safe here: @unique_key is set from a developer-controlled
        # symbol (e.g. :issue_snapshot_id), never from user input.
        unique_key_sql = Arel.sql("metadata ->> '#{@unique_key}'")
        new_event_ids = ToolEvent
          .where(
            organization_id: org_id,
            tool_name:        tool_name,
            event_type:       event_type
          )
          .where("metadata ->> ? IN (?)", @unique_key, new_records.map { |r| r[:unique_value].to_s })
          .order(occurred_at: :desc)
          .pluck(unique_key_sql, :id)
          .to_h

        dedup_rows = new_records.map do |r|
          val = r[:unique_value].to_s
          {
            organization_id: org_id,
            tool_name:        tool_name,
            event_type:       event_type,
            unique_key:       @unique_key,
            unique_value:     val,
            tool_event_id:    new_event_ids[val] || "00000000-0000-0000-0000-000000000000",
            updated_at:       now
          }
        end

        bulk_upsert_dedup_rows(dedup_rows)
      end

      # --- Step 3: update mutable fields on existing ToolEvents ---
      return if existing_records.empty?

      existing_records.each do |r|
        event_id = existing_map[r[:unique_value].to_s]
        next unless event_id

        event = ToolEvent.find_by(id: event_id)
        event&.update!(r.except(*IMMUTABLE_LOOKUP_FIELDS, :unique_value))
      end
    end

    private

    # Rails upsert_all includes every column in the INSERT list, which causes
    # `id = NULL` for bigserial columns not present in the hash (Rails 8.1 bug).
    # Use raw SQL so that `id` is omitted entirely and the sequence fires naturally.
    def bulk_upsert_dedup_rows(rows)
      return if rows.empty?

      conn          = ConnectorEventDedup.connection
      table         = ConnectorEventDedup.quoted_table_name
      conflict_cols = %w[organization_id tool_name event_type unique_key unique_value]
                        .map { |c| conn.quote_column_name(c) }.join(", ")
      col_names     = rows.first.keys.map { |k| conn.quote_column_name(k) }.join(", ")

      values_sql = rows.map do |row|
        vals = row.values.map { |v| v.nil? ? "NULL" : conn.quote(v) }
        "(#{vals.join(', ')})"
      end.join(", ")

      conn.execute(<<~SQL)
        INSERT INTO #{table} (#{col_names})
        VALUES #{values_sql}
        ON CONFLICT (#{conflict_cols})
        DO UPDATE SET
          tool_event_id = EXCLUDED.tool_event_id,
          updated_at    = EXCLUDED.updated_at
      SQL
    end

    # Rails insert_all/insert_all! cannot be used on TimescaleDB hypertables
    # because schema_cache.primary_keys returns [] for hypertables (no standard PK
    # constraint), causing find_unique_index_for to raise ArgumentError. Use raw
    # SQL instead — we pre-filtered duplicates in Step 1 so no ON CONFLICT needed.
    def bulk_insert_tool_events(rows)
      return if rows.empty?

      conn      = ToolEvent.connection
      col_names = rows.first.keys.map { |k| conn.quote_column_name(k) }.join(", ")
      col_types = ToolEvent.columns_hash

      values_sql = rows.map do |row|
        vals = row.values.map.with_index do |val, i|
          key  = row.keys[i].to_s
          type = col_types[key]
          if val.nil?
            "NULL"
          elsif type&.type == :jsonb || type&.type == :json || val.is_a?(Hash) || val.is_a?(Array)
            conn.quote(val.to_json)
          else
            conn.quote(val)
          end
        end
        "(#{vals.join(', ')})"
      end.join(", ")

      conn.execute(
        "INSERT INTO #{ToolEvent.quoted_table_name} (#{col_names}) VALUES #{values_sql}"
      )
    end
  end
end

# frozen_string_literal: true

# Removes TimescaleDB chunk noise from db/structure.sql.
#
# After every `rails db:migrate`, pg_dump writes per-chunk objects for the
# hypertable into structure.sql. These are runtime artefacts that vary between
# environments and change on every chunk window rotation:
#
#   _timescaledb_internal._hyper_X_N_chunk* — tables, indexes, constraints,
#     column defaults, and FK constraints for every time-series data chunk.
#
# What we intentionally KEEP (required for correct schema restore):
#   _timescaledb_internal._materialized_hypertable_N — backing table for
#     continuous aggregates (referenced by cagg views in the timeseries schema)
#   _timescaledb_internal._partial_view_N   — partial view used by cagg refresh
#   _timescaledb_internal._direct_view_N    — direct view used by cagg refresh
#   _timescaledb_internal._compressed_hypertable_N — compressed storage schema
#
# Usage:
#   rails db:structure:clean              # clean structure.sql in-place
#
# The Makefile `db-migrate` target runs this automatically after every migration.

namespace :db do
  namespace :structure do
    desc "Strip TimescaleDB-internal chunks from db/structure.sql"
    task :clean do
      structure_file = Rails.root.join("db", "structure.sql")

      unless structure_file.exist?
        warn "[db:structure:clean] #{structure_file} not found — skipping"
        next
      end

      original = structure_file.read
      cleaned  = DbStructureCleaner.clean(original)

      if cleaned == original
        puts "[db:structure:clean] structure.sql is already clean — nothing to remove"
      else
        removed = original.lines.size - cleaned.lines.size
        structure_file.write(cleaned)
        puts "[db:structure:clean] Done — removed #{removed} lines of _timescaledb_internal noise"
      end
    end
  end
end

# Run automatically after every migration so developers never have to remember.
Rake::Task["db:migrate"].enhance do
  Rake::Task["db:structure:clean"].invoke
end

# ---------------------------------------------------------------------------
# Cleaner — pure Ruby, no external dependencies.
# ---------------------------------------------------------------------------
module DbStructureCleaner
  INTERNAL_SCHEMA = "_timescaledb_internal"

  # Chunk objects are environment-specific and grow without bound with each
  # chunk window. Their names follow two patterns:
  #   _hyper_X_N_chunk         — raw data chunks for hypertables
  #   compress_hyper_X_N_chunk — compressed data chunks
  #
  # Everything else in _timescaledb_internal is required for a correct restore:
  #   _materialized_hypertable_N, _partial_view_N, _direct_view_N,
  #   _compressed_hypertable_N (schema only, not data chunks).
  CHUNK_NAME_PATTERN = /\A(?:_hyper_|compress_hyper_)/

  class << self
    # Strip pg_dump blocks for _timescaledb_internal chunk objects.
    #
    # pg_dump wraps every object in a 3-line comment block:
    #
    #   --
    #   -- Name: <name>; Type: <type>; Schema: _timescaledb_internal; Owner: -
    #   --
    #
    # followed by the SQL statement(s), then a blank line before the next block.
    # We detect that 3-line header, check that the Name is a chunk name, and skip
    # everything up to (and including) the blank line that terminates the block.
    #
    # @param sql [String] raw content of structure.sql
    # @return [String] cleaned content
    def clean(sql)
      lines  = sql.lines
      output = []
      i      = 0
      skipping = false

      while i < lines.size
        line = lines[i]

        if skipping
          # Keep skipping until we reach the blank line that ends the block.
          # That blank line is immediately followed by another `--` comment or EOF.
          if blank?(line) && (i + 1 >= lines.size || lines[i + 1].start_with?("--"))
            skipping = false
            # Don't emit the blank line — collapse it away.
          end
          i += 1
          next
        end

        # Detect the 3-line comment header for a _hyper_X_N_chunk object.
        if chunk_block_header?(lines, i)
          # Also discard the trailing blank line we already emitted before this header.
          output.pop while output.last && blank?(output.last)
          skipping = true
          i += 3  # skip past the three header lines
          next
        end

        output << line
        i += 1
      end

      output.join.gsub(/\n{3,}/, "\n\n")
    end

    private

    def chunk_block_header?(lines, i)
      return false unless i + 2 < lines.size
      return false unless lines[i] == "--\n" && lines[i + 2] == "--\n"

      name_line = lines[i + 1]
      return false unless name_line.include?("Schema: #{INTERNAL_SCHEMA}")

      # Extract the object name (first token after "-- Name: ") and check it's a chunk.
      name = name_line[/-- Name: ([^;]+);/, 1].to_s.strip
      CHUNK_NAME_PATTERN.match?(name)
    end

    def blank?(line)
      line == "\n"
    end
  end
end

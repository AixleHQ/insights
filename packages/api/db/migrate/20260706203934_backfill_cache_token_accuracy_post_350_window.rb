# frozen_string_literal: true

class BackfillCacheTokenAccuracyPost350Window < ActiveRecord::Migration[8.0]
  disable_ddl_transaction!

  BATCH_SIZE = 1000

  def up
    loop do
      rows_affected = exec_update(<<~SQL)
        WITH batch AS (
          SELECT id, occurred_at
          FROM timeseries.tool_events
          WHERE metadata->>'base_input_tokens' IS NOT NULL
            AND metadata->>'base_input_tokens' ~ '^\\d+$'
            AND tokens_in > (metadata->>'base_input_tokens')::integer
            AND (metadata->>'_pre_350_tokens_in') IS NULL
            AND (metadata->>'_pre_519_tokens_in') IS NULL
          LIMIT #{BATCH_SIZE}
        )
        UPDATE timeseries.tool_events te
        SET
          tokens_in = (te.metadata->>'base_input_tokens')::integer,
          tokens_total = (te.metadata->>'base_input_tokens')::integer + COALESCE(te.tokens_out, 0),
          metadata = te.metadata || jsonb_build_object('_pre_519_tokens_in', te.tokens_in)
        FROM batch
        WHERE te.id = batch.id AND te.occurred_at = batch.occurred_at
      SQL

      break if rows_affected == 0
      sleep(0.1)
    end
  end

  def down
    loop do
      rows_affected = exec_update(<<~SQL)
        WITH batch AS (
          SELECT id, occurred_at
          FROM timeseries.tool_events
          WHERE (metadata->>'_pre_519_tokens_in') IS NOT NULL
          LIMIT #{BATCH_SIZE}
        )
        UPDATE timeseries.tool_events te
        SET
          tokens_in = (te.metadata->>'_pre_519_tokens_in')::integer,
          tokens_total = (te.metadata->>'_pre_519_tokens_in')::integer + COALESCE(te.tokens_out, 0),
          metadata = te.metadata - '_pre_519_tokens_in'
        FROM batch
        WHERE te.id = batch.id AND te.occurred_at = batch.occurred_at
      SQL

      break if rows_affected == 0
      sleep(0.1)
    end
  end

  private

  def exec_update(sql)
    ActiveRecord::Base.connection.exec_update(sql)
  end
end

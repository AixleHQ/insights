# frozen_string_literal: true

class AddRiskLevelIndexToToolEvents < ActiveRecord::Migration[8.0]
  def up
    execute <<~SQL
      CREATE INDEX IF NOT EXISTS index_tool_events_on_metadata_risk_level
        ON timeseries.tool_events ((metadata->>'risk_level'))
        WHERE metadata->>'risk_level' IS NOT NULL;
    SQL
  end

  def down
    execute "DROP INDEX IF EXISTS timeseries.index_tool_events_on_metadata_risk_level"
  end
end

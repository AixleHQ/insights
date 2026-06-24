# frozen_string_literal: true

class AddRiskLevelIndexToToolEvents < ActiveRecord::Migration[8.0]
  disable_ddl_transaction!

  def change
    add_index "timeseries.tool_events",
              "(metadata->>'risk_level')",
              name: "index_tool_events_on_metadata_risk_level",
              where: "metadata->>'risk_level' IS NOT NULL",
              algorithm: :concurrently
  end
end

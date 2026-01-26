class AddDurationMsToToolEvents < ActiveRecord::Migration[8.1]
  def up
    execute <<-SQL
      ALTER TABLE timeseries.tool_events
      ADD COLUMN duration_ms INTEGER;
    SQL
  end

  def down
    execute <<-SQL
      ALTER TABLE timeseries.tool_events
      DROP COLUMN IF EXISTS duration_ms;
    SQL
  end
end

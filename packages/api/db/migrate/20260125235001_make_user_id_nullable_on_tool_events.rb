class MakeUserIdNullableOnToolEvents < ActiveRecord::Migration[8.1]
  def up
    execute <<-SQL
      ALTER TABLE timeseries.tool_events
      ALTER COLUMN user_id DROP NOT NULL;
    SQL
  end

  def down
    # Note: This will fail if there are any NULL user_id values
    execute <<-SQL
      ALTER TABLE timeseries.tool_events
      ALTER COLUMN user_id SET NOT NULL;
    SQL
  end
end

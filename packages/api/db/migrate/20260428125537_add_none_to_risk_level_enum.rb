class AddNoneToRiskLevelEnum < ActiveRecord::Migration[8.1]
  def up
    execute "ALTER TYPE risk_level ADD VALUE IF NOT EXISTS 'none'"
  end

  def down
    # Rebuild the enum without 'none'. Must run after deploys that no longer
    # write 'none' rows — or accept that any 'none' records are migrated to 'low'.
    execute "UPDATE audit_logs SET risk_level = 'low' WHERE risk_level = 'none'"
    execute "ALTER TABLE audit_logs ALTER COLUMN risk_level TYPE text"
    execute "DROP TYPE risk_level"
    execute "CREATE TYPE risk_level AS ENUM ('low', 'medium', 'high', 'critical')"
    execute "ALTER TABLE audit_logs ALTER COLUMN risk_level TYPE risk_level USING risk_level::risk_level"
  end
end

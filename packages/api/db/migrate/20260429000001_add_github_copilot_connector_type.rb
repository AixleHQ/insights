# frozen_string_literal: true

class AddGithubCopilotConnectorType < ActiveRecord::Migration[8.1]
  disable_ddl_transaction!

  def up
    execute "ALTER TYPE connector_type ADD VALUE IF NOT EXISTS 'github_copilot'"
  end

  def down
    raise ActiveRecord::IrreversibleMigration
  end
end

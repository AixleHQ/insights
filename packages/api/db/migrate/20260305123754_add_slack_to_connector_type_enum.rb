# frozen_string_literal: true

class AddSlackToConnectorTypeEnum < ActiveRecord::Migration[8.1]
  def up
    execute "ALTER TYPE connector_type ADD VALUE IF NOT EXISTS 'slack'"
  end

  def down
    raise ActiveRecord::IrreversibleMigration
  end
end

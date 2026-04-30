# frozen_string_literal: true

class AddGitlabToToolNameEnum < ActiveRecord::Migration[8.1]
  def up
    execute "ALTER TYPE public.tool_name ADD VALUE IF NOT EXISTS 'gitlab'"
  end

  def down
    raise ActiveRecord::IrreversibleMigration
  end
end

# frozen_string_literal: true

class AddLinearGithubToToolNameEnum < ActiveRecord::Migration[8.1]
  def up
    execute "ALTER TYPE public.tool_name ADD VALUE IF NOT EXISTS 'linear'"
    execute "ALTER TYPE public.tool_name ADD VALUE IF NOT EXISTS 'github'"
  end

  def down
    raise ActiveRecord::IrreversibleMigration
  end
end

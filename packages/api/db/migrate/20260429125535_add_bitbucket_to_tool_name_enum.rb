# frozen_string_literal: true

class AddBitbucketToToolNameEnum < ActiveRecord::Migration[8.1]
  def up
    execute "ALTER TYPE public.tool_name ADD VALUE IF NOT EXISTS 'bitbucket'"
  end

  def down
    raise ActiveRecord::IrreversibleMigration
  end
end

# frozen_string_literal: true

class AddGitlabToToolNameEnum < ActiveRecord::Migration[8.1]
  def up
    execute "ALTER TYPE public.tool_name ADD VALUE IF NOT EXISTS 'gitlab'"
  end

  def down
    # PG cannot drop enum labels; reversal needs recreating `tool_name` and retyping all dependents (incl. Timescale chunks)—out of scope for `rails db:rollback`.
    raise ActiveRecord::IrreversibleMigration
  end
end

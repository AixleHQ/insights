# frozen_string_literal: true

# DEPLOY ORDER: run this migration BEFORE deploying the app.
# After this migration, the 'openrouter' enum value no longer exists — the app
# must be on the new code (expecting 'openrouter_api') before any writes occur.
class RenameOpenrouterToolName < ActiveRecord::Migration[8.1]
  def up
    execute "ALTER TYPE public.tool_name RENAME VALUE 'openrouter' TO 'openrouter_api'"
  end

  def down
    execute "ALTER TYPE public.tool_name RENAME VALUE 'openrouter_api' TO 'openrouter'"
  end
end

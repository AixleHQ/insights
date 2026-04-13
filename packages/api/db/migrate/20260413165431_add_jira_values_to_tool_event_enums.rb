# frozen_string_literal: true

class AddJiraValuesToToolEventEnums < ActiveRecord::Migration[8.1]
  def up
    # tool_name: only 'jira' — the job always sets tool_name: "jira" for all event types.
    # 'linear' and 'github' are intentionally NOT added: no existing job uses them as
    # tool_name values; widening the enum without a consumer adds noise.
    execute "ALTER TYPE public.tool_name ADD VALUE IF NOT EXISTS 'jira'"

    # event_type: issue / comment / sprint — all three are set by JiraSyncJob
    execute "ALTER TYPE public.event_type ADD VALUE IF NOT EXISTS 'issue'"
    execute "ALTER TYPE public.event_type ADD VALUE IF NOT EXISTS 'comment'"
    execute "ALTER TYPE public.event_type ADD VALUE IF NOT EXISTS 'sprint'"
  end

  def down
    # PostgreSQL enum values cannot be removed without a full type rebuild.
    # These values are harmless if no rows use them.
    raise ActiveRecord::IrreversibleMigration
  end
end

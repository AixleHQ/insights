# frozen_string_literal: true

class AddToolUseToEventTypeEnum < ActiveRecord::Migration[8.1]
  disable_ddl_transaction!

  def up
    execute <<~SQL
      ALTER TYPE public.event_type ADD VALUE IF NOT EXISTS 'tool_use';
    SQL
  end

  def down
    # No-op: removing a PG enum value requires recreating the type.
    # Leaving 'tool_use' present is harmless.
  end
end

class AddConnectionStateToUserToolAccounts < ActiveRecord::Migration[8.1]
  def up
    add_column :user_tool_accounts, :connection_state, :string, null: false, default: "inactive"
    add_index :user_tool_accounts, :connection_state

    execute <<~SQL
      UPDATE user_tool_accounts
      SET connection_state = CASE
        WHEN is_active = TRUE THEN 'active'
        ELSE 'inactive'
      END
    SQL
  end

  def down
    remove_index :user_tool_accounts, :connection_state
    remove_column :user_tool_accounts, :connection_state
  end
end

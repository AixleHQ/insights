class RemoveIsActiveFromUserToolAccounts < ActiveRecord::Migration[8.1]
  def change
    remove_column :user_tool_accounts, :is_active, :boolean
  end
end

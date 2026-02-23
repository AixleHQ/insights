class AddExternalAccountFieldsToUserToolAccounts < ActiveRecord::Migration[8.1]
  def change
    add_column :user_tool_accounts, :external_account_id, :string
    add_column :user_tool_accounts, :external_account_name, :string
  end
end

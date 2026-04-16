# frozen_string_literal: true

class AddTokenHashToUserToolAccounts < ActiveRecord::Migration[8.1]
  def change
    add_column :user_tool_accounts, :token_hash, :string
    add_index :user_tool_accounts, :token_hash, unique: true
  end
end

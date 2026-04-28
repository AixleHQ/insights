class CreateUserToolAccounts < ActiveRecord::Migration[8.1]
  def change
    create_table :user_tool_accounts, id: :uuid do |t|
      t.references :organization_membership, null: false, foreign_key: true, type: :uuid
      t.column :tool_name, :tool_name, null: false
      t.string :external_user_id
      t.string :external_username
      t.string :external_email
      t.text :access_token
      t.text :refresh_token
      t.datetime :token_expires_at
      t.boolean :is_active, default: true, null: false

      t.timestamps
    end

    add_index :user_tool_accounts, [ :organization_membership_id, :tool_name ], unique: true, name: 'idx_user_tool_accounts_membership_tool'
  end
end

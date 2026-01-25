class CreateUsers < ActiveRecord::Migration[8.1]
  def change
    create_table :users, id: :uuid do |t|
      t.string :keycloak_sub, null: false
      t.string :email, null: false
      t.string :name
      t.string :avatar_url
      t.boolean :global_admin, default: false, null: false

      t.timestamps
    end

    add_index :users, :keycloak_sub, unique: true
    add_index :users, :email, unique: true
  end
end

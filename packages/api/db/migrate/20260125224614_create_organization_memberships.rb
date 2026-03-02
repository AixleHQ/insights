class CreateOrganizationMemberships < ActiveRecord::Migration[8.1]
  def change
    create_table :organization_memberships, id: :uuid do |t|
      t.references :user, null: false, foreign_key: true, type: :uuid
      t.references :organization, null: false, foreign_key: true, type: :uuid
      t.column :role, :member_role, null: false, default: 'member'

      t.timestamps
    end

    add_index :organization_memberships, [ :user_id, :organization_id ], unique: true
  end
end

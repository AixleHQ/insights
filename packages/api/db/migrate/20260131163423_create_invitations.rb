class CreateInvitations < ActiveRecord::Migration[8.1]
  def up
    # Create enum for invitation status
    execute <<-SQL
      CREATE TYPE invitation_status AS ENUM ('pending', 'accepted', 'revoked', 'expired');
    SQL

    create_table :invitations, id: :uuid do |t|
      t.references :organization, null: false, foreign_key: true, type: :uuid
      t.references :invited_by, null: false, foreign_key: { to_table: :users }, type: :uuid
      t.string :email, null: false
      t.string :token, null: false
      t.column :role, :member_role, null: false, default: 'member'
      t.column :status, :invitation_status, null: false, default: 'pending'
      t.datetime :expires_at
      t.datetime :accepted_at

      t.timestamps
    end

    add_index :invitations, :token, unique: true
    add_index :invitations, [:organization_id, :email], unique: true, where: "status = 'pending'"
  end

  def down
    drop_table :invitations
    execute "DROP TYPE IF EXISTS invitation_status"
  end
end

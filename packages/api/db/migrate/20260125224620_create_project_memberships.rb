class CreateProjectMemberships < ActiveRecord::Migration[8.1]
  def change
    create_table :project_memberships, id: :uuid do |t|
      t.references :user, null: false, foreign_key: true, type: :uuid
      t.references :project, null: false, foreign_key: true, type: :uuid
      t.column :role, :member_role, null: false, default: 'member'

      t.timestamps
    end

    add_index :project_memberships, [ :user_id, :project_id ], unique: true
  end
end

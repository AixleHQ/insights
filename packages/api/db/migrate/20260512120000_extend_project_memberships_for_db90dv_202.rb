# frozen_string_literal: true

class ExtendProjectMembershipsForAIX202 < ActiveRecord::Migration[8.1]
  def up
    execute <<-SQL.squish
      UPDATE project_memberships
      SET role = 'member'::public.member_role
      WHERE role = 'admin'::public.member_role
    SQL

    add_column :project_memberships, :created_by_id, :uuid
    add_index :project_memberships, :created_by_id
    add_foreign_key :project_memberships, :users, column: :created_by_id,
                                                name: "fk_project_memberships_created_by_id"
  end

  def down
    remove_foreign_key :project_memberships, name: "fk_project_memberships_created_by_id"
    remove_index :project_memberships, :created_by_id
    remove_column :project_memberships, :created_by_id
  end
end

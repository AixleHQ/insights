# frozen_string_literal: true

class MigrateAdminOrgRolesToMember < ActiveRecord::Migration[8.1]
  def up
    execute "UPDATE organization_memberships SET role = 'member'::member_role WHERE role = 'admin'::member_role"
    execute "UPDATE invitations SET role = 'member' WHERE role = 'admin' AND status = 'pending'"
  end

  def down
    # Cannot restore original admin assignments — admin is deprecated as an org role.
  end
end

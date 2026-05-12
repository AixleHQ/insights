# frozen_string_literal: true

# Removes `admin` from PostgreSQL enum `member_role` (shared by organization_memberships,
# project_memberships, invitations). Data migrations AIX-201 / AIX-202 already rewrote
# admin rows to member; this migration narrows the type so SQL cannot insert admin again.
class RemoveAdminFromMemberRoleEnum < ActiveRecord::Migration[8.1]
  def up
    execute <<~SQL.squish
      UPDATE organization_memberships
      SET role = 'member'::public.member_role
      WHERE role::text = 'admin';

      UPDATE invitations
      SET role = 'member'::public.member_role
      WHERE role::text = 'admin';

      UPDATE project_memberships
      SET role = 'member'::public.member_role
      WHERE role::text = 'admin';
    SQL

    execute "CREATE TYPE public.member_role_new AS ENUM ('owner', 'member', 'viewer')"

    %w[organization_memberships invitations project_memberships].each do |table|
      execute "ALTER TABLE public.#{table} ALTER COLUMN role DROP DEFAULT"
      execute <<~SQL.squish
        ALTER TABLE public.#{table}
          ALTER COLUMN role TYPE public.member_role_new
          USING (
            CASE role::text
              WHEN 'admin' THEN 'member'
              ELSE role::text
            END
          )::public.member_role_new
      SQL
      execute "ALTER TABLE public.#{table} ALTER COLUMN role SET DEFAULT 'member'::public.member_role_new"
    end

    execute "DROP TYPE public.member_role"
    execute "ALTER TYPE public.member_role_new RENAME TO member_role"
  end

  def down
    execute "CREATE TYPE public.member_role_with_admin AS ENUM ('owner', 'admin', 'member', 'viewer')"

    %w[organization_memberships invitations project_memberships].each do |table|
      execute "ALTER TABLE public.#{table} ALTER COLUMN role DROP DEFAULT"
      execute <<~SQL.squish
        ALTER TABLE public.#{table}
          ALTER COLUMN role TYPE public.member_role_with_admin
          USING (role::text::public.member_role_with_admin)
      SQL
      execute "ALTER TABLE public.#{table} ALTER COLUMN role SET DEFAULT 'member'::public.member_role_with_admin"
    end

    execute "DROP TYPE public.member_role"
    execute "ALTER TYPE public.member_role_with_admin RENAME TO member_role"
  end
end

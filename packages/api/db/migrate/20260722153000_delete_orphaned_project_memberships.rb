# frozen_string_literal: true

# One-time cleanup for stale project_memberships left after org membership
# hard-delete (AIX-591). Deletes only — no historical ownership transfer.
class DeleteOrphanedProjectMemberships < ActiveRecord::Migration[8.1]
  def up
    execute <<~SQL.squish
      DELETE FROM project_memberships
      WHERE id IN (
        SELECT pm.id
        FROM project_memberships pm
        INNER JOIN projects p ON p.id = pm.project_id
        WHERE p.organization_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM organization_memberships om
            WHERE om.user_id = pm.user_id
              AND om.organization_id = p.organization_id
          )
      )
    SQL
  end

  def down
    # Irreversible data cleanup — orphaned rows cannot be reconstructed.
  end
end

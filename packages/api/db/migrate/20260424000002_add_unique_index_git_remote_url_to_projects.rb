class AddUniqueIndexGitRemoteUrlToProjects < ActiveRecord::Migration[8.1]
  def up
    # Nullify git_remote_url on older duplicate rows (keep the most recently updated one)
    execute <<~SQL
      UPDATE projects
      SET git_remote_url = NULL
      WHERE id IN (
        SELECT id FROM (
          SELECT id,
                 ROW_NUMBER() OVER (
                   PARTITION BY organization_id, git_remote_url
                   ORDER BY updated_at DESC
                 ) AS rn
          FROM projects
          WHERE organization_id IS NOT NULL AND git_remote_url IS NOT NULL
        ) ranked
        WHERE rn > 1
      )
    SQL

    execute <<~SQL
      UPDATE projects
      SET git_remote_url = NULL
      WHERE id IN (
        SELECT id FROM (
          SELECT id,
                 ROW_NUMBER() OVER (
                   PARTITION BY owner_id, git_remote_url
                   ORDER BY updated_at DESC
                 ) AS rn
          FROM projects
          WHERE owner_id IS NOT NULL AND git_remote_url IS NOT NULL
        ) ranked
        WHERE rn > 1
      )
    SQL

    add_index :projects, [ :organization_id, :git_remote_url ],
      unique: true,
      where: "organization_id IS NOT NULL AND git_remote_url IS NOT NULL",
      name: "index_projects_on_org_and_git_remote_url"

    add_index :projects, [ :owner_id, :git_remote_url ],
      unique: true,
      where: "owner_id IS NOT NULL AND git_remote_url IS NOT NULL",
      name: "index_projects_on_owner_and_git_remote_url"
  end

  def down
    remove_index :projects, name: "index_projects_on_org_and_git_remote_url"
    remove_index :projects, name: "index_projects_on_owner_and_git_remote_url"
  end
end

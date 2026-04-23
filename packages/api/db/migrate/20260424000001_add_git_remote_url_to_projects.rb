class AddGitRemoteUrlToProjects < ActiveRecord::Migration[8.1]
  def change
    add_column :projects, :git_remote_url, :string
    add_index :projects, :git_remote_url
  end
end

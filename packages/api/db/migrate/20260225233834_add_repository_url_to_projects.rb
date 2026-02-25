class AddRepositoryUrlToProjects < ActiveRecord::Migration[8.1]
  def change
    add_column :projects, :repository_url, :string
  end
end

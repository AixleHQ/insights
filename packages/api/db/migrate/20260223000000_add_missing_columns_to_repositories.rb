class AddMissingColumnsToRepositories < ActiveRecord::Migration[8.1]
  def change
    add_column :repositories, :description, :text
    add_column :repositories, :clone_url, :string
    add_column :repositories, :html_url, :string
  end
end

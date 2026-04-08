class MakeProjectIdNullableOnRepositories < ActiveRecord::Migration[8.1]
  def change
    change_column_null :repositories, :project_id, true
  end
end

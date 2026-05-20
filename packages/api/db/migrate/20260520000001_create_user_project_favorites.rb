# frozen_string_literal: true

class CreateUserProjectFavorites < ActiveRecord::Migration[8.1]
  def change
    create_table :user_project_favorites, id: :uuid do |t|
      t.references :user,    null: false, foreign_key: true, type: :uuid
      t.references :project, null: false, foreign_key: true, type: :uuid
      t.timestamps
    end

    add_index :user_project_favorites, %i[user_id project_id], unique: true
  end
end

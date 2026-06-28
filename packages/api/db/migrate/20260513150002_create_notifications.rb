class CreateNotifications < ActiveRecord::Migration[8.1]
  def change
    create_table :notifications, id: :uuid, default: "gen_random_uuid()" do |t|
      t.references :user,         null: false, foreign_key: true, type: :uuid
      t.references :organization, null: false, foreign_key: true, type: :uuid
      t.string     :notification_type, null: false
      t.jsonb      :payload,      null: false, default: {}
      t.datetime   :read_at
      t.timestamps null: false
    end

    add_index :notifications, %i[user_id read_at]
  end
end

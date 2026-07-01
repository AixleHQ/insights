# frozen_string_literal: true

class CreateScheduledExports < ActiveRecord::Migration[8.1]
  def change
    create_table :scheduled_exports, id: :uuid, default: "gen_random_uuid()" do |t|
      t.references :organization, null: false, foreign_key: true, type: :uuid
      t.references :created_by,   null: false, foreign_key: { to_table: :users }, type: :uuid
      t.string  :report_type, null: false
      t.string  :format,      null: false, default: "csv"
      t.string  :frequency,   null: false
      t.integer :day_of_week
      t.integer :day_of_month
      t.jsonb   :recipients,  null: false, default: []
      t.string  :group_by
      t.boolean :active,      null: false, default: true
      t.datetime :last_run_at
      t.datetime :next_run_at, null: false
      t.timestamps
    end

    add_index :scheduled_exports, [ :organization_id, :active ]
    add_index :scheduled_exports, :next_run_at
  end
end

class CreateUserPersonalSettings < ActiveRecord::Migration[8.1]
  def change
    create_table :user_personal_settings, id: :uuid, default: "gen_random_uuid()" do |t|
      # index: { unique: true } avoids a duplicate non-unique index that t.references adds by default
      t.references :user, null: false, foreign_key: true, type: :uuid, index: { unique: true }
      t.integer  :cost_threshold_cents
      t.integer  :token_threshold
      t.boolean  :alert_email, default: true,  null: false
      t.boolean  :alert_slack, default: false, null: false
      t.string   :theme
      t.string   :timezone
      t.timestamps
    end
  end
end

class CreateNotificationRoutes < ActiveRecord::Migration[8.1]
  def change
    create_table :notification_routes, id: :uuid, default: "gen_random_uuid()" do |t|
      t.references :organization, null: false, foreign_key: true, type: :uuid
      t.string :notification_type, null: false
      t.string :recipient_type,    null: false
      t.string :recipient_role,    null: true
      t.references :recipient_user, null: true, foreign_key: { to_table: :users }, type: :uuid
      t.boolean :enabled, null: false, default: true
      t.timestamps
    end

    # Ticket specifies a composite unique index on (organization_id, notification_type,
    # recipient_type, recipient_role, recipient_user_id). PostgreSQL treats NULLs as
    # distinct in unique indexes, so a single composite index won't prevent duplicates
    # when the nullable column is NULL. Two partial indexes enforce the constraint correctly.
    add_index :notification_routes,
              %i[organization_id notification_type recipient_role],
              unique: true,
              where: "recipient_type = 'role'",
              name: "idx_notification_routes_role_unique"

    add_index :notification_routes,
              %i[organization_id notification_type recipient_user_id],
              unique: true,
              where: "recipient_type = 'user'",
              name: "idx_notification_routes_user_unique"
  end
end

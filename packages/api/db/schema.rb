# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_01_25_224627) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"
  enable_extension "pgcrypto"
  enable_extension "timescaledb"

  # Custom types defined in this database.
  # Note that some types may not work with other database engines. Be careful if changing database.
  create_enum "connector_type", ["github", "gitlab", "bitbucket", "jira", "linear", "openrouter", "anthropic", "openai", "gemini"]
  create_enum "daily_aggregate_retention", ["365_days", "730_days", "1095_days", "forever"]
  create_enum "event_type", ["chat", "completion", "edit", "commit", "review", "test", "debug", "refactor", "documentation", "other"]
  create_enum "hourly_aggregate_retention", ["90_days", "180_days", "365_days", "730_days"]
  create_enum "member_role", ["owner", "admin", "member", "viewer"]
  create_enum "raw_event_ttl", ["6_hours", "12_hours", "24_hours", "48_hours", "72_hours"]
  create_enum "risk_level", ["low", "medium", "high", "critical"]
  create_enum "tool_events_retention", ["30_days", "60_days", "90_days", "180_days", "365_days", "730_days"]
  create_enum "tool_name", ["claude_code", "cursor", "windsurf", "github_copilot", "aider", "continue", "cody", "tabnine", "amazon_q", "openrouter", "anthropic_api", "openai_api", "gemini_api", "custom"]

  create_table "admin_audit_logs", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.string "action", null: false
    t.uuid "admin_user_id", null: false
    t.datetime "created_at", null: false
    t.string "ip_address"
    t.jsonb "metadata", default: {}
    t.uuid "resource_id"
    t.string "resource_type", null: false
    t.jsonb "tracked_changes", default: {}
    t.string "user_agent"
    t.index ["admin_user_id"], name: "index_admin_audit_logs_on_admin_user_id"
    t.index ["created_at"], name: "index_admin_audit_logs_on_created_at"
    t.index ["resource_type", "resource_id"], name: "index_admin_audit_logs_on_resource_type_and_resource_id"
  end

  create_table "audit_logs", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.text "classification_labels", default: [], array: true
    t.decimal "confidence_score", precision: 5, scale: 4
    t.datetime "created_at", null: false
    t.jsonb "metadata", default: {}
    t.uuid "organization_id", null: false
    t.uuid "policy_version_id"
    t.string "raw_event_key", null: false
    t.enum "risk_level", default: "low", null: false, enum_type: "risk_level"
    t.text "sanitization_actions", default: [], array: true
    t.string "temporal_workflow_id"
    t.uuid "tool_event_id"
    t.index ["organization_id"], name: "index_audit_logs_on_organization_id"
    t.index ["policy_version_id"], name: "index_audit_logs_on_policy_version_id"
    t.index ["raw_event_key"], name: "index_audit_logs_on_raw_event_key"
    t.index ["temporal_workflow_id"], name: "index_audit_logs_on_temporal_workflow_id"
    t.index ["tool_event_id"], name: "index_audit_logs_on_tool_event_id"
  end

  create_table "organization_connectors", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.text "access_token"
    t.jsonb "config", default: {}
    t.enum "connector_type", null: false, enum_type: "connector_type"
    t.datetime "created_at", null: false
    t.string "external_account_id"
    t.string "external_account_name"
    t.string "external_org_id"
    t.string "external_org_name"
    t.boolean "is_active", default: true, null: false
    t.string "last_error"
    t.datetime "last_sync_at"
    t.uuid "organization_id", null: false
    t.text "refresh_token"
    t.text "scopes", default: [], array: true
    t.datetime "token_expires_at"
    t.datetime "updated_at", null: false
    t.string "webhook_secret"
    t.index ["organization_id", "connector_type"], name: "idx_on_organization_id_connector_type_ebd5fb8c77", unique: true
    t.index ["organization_id"], name: "index_organization_connectors_on_organization_id"
  end

  create_table "organization_memberships", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.datetime "created_at", null: false
    t.uuid "organization_id", null: false
    t.enum "role", default: "member", null: false, enum_type: "member_role"
    t.datetime "updated_at", null: false
    t.uuid "user_id", null: false
    t.index ["organization_id"], name: "index_organization_memberships_on_organization_id"
    t.index ["user_id", "organization_id"], name: "index_organization_memberships_on_user_id_and_organization_id", unique: true
    t.index ["user_id"], name: "index_organization_memberships_on_user_id"
  end

  create_table "organization_retention_policies", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.datetime "created_at", null: false
    t.enum "daily_aggregate_retention", default: "forever", null: false, enum_type: "daily_aggregate_retention"
    t.enum "hourly_aggregate_retention", default: "365_days", null: false, enum_type: "hourly_aggregate_retention"
    t.uuid "organization_id", null: false
    t.enum "raw_event_ttl", default: "24_hours", null: false, enum_type: "raw_event_ttl"
    t.string "retention_reason"
    t.enum "tool_events_retention", default: "90_days", null: false, enum_type: "tool_events_retention"
    t.datetime "updated_at", null: false
    t.uuid "updated_by_id"
    t.index ["organization_id"], name: "index_organization_retention_policies_on_organization_id", unique: true
    t.index ["updated_by_id"], name: "index_organization_retention_policies_on_updated_by_id"
  end

  create_table "organization_settings", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "key", null: false
    t.uuid "organization_id", null: false
    t.datetime "updated_at", null: false
    t.jsonb "value", default: {}
    t.index ["organization_id", "key"], name: "index_organization_settings_on_organization_id_and_key", unique: true
    t.index ["organization_id"], name: "index_organization_settings_on_organization_id"
  end

  create_table "organizations", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "description"
    t.boolean "is_active", default: true, null: false
    t.string "name", null: false
    t.string "slug", null: false
    t.datetime "updated_at", null: false
    t.index ["slug"], name: "index_organizations_on_slug", unique: true
  end

  create_table "project_memberships", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.datetime "created_at", null: false
    t.uuid "project_id", null: false
    t.enum "role", default: "member", null: false, enum_type: "member_role"
    t.datetime "updated_at", null: false
    t.uuid "user_id", null: false
    t.index ["project_id"], name: "index_project_memberships_on_project_id"
    t.index ["user_id", "project_id"], name: "index_project_memberships_on_user_id_and_project_id", unique: true
    t.index ["user_id"], name: "index_project_memberships_on_user_id"
  end

  create_table "project_settings", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "key", null: false
    t.uuid "project_id", null: false
    t.datetime "updated_at", null: false
    t.jsonb "value", default: {}
    t.index ["project_id", "key"], name: "index_project_settings_on_project_id_and_key", unique: true
    t.index ["project_id"], name: "index_project_settings_on_project_id"
  end

  create_table "projects", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "description"
    t.boolean "is_active", default: true, null: false
    t.string "name", null: false
    t.uuid "organization_id"
    t.uuid "owner_id"
    t.string "slug", null: false
    t.datetime "updated_at", null: false
    t.index ["organization_id", "slug"], name: "index_projects_on_organization_id_and_slug", unique: true, where: "(organization_id IS NOT NULL)"
    t.index ["organization_id"], name: "index_projects_on_organization_id"
    t.index ["owner_id", "slug"], name: "index_projects_on_owner_id_and_slug", unique: true, where: "(owner_id IS NOT NULL)"
    t.index ["owner_id"], name: "index_projects_on_owner_id"
  end

  create_table "repositories", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "default_branch"
    t.string "external_id", null: false
    t.string "full_name", null: false
    t.boolean "is_private", default: false
    t.datetime "last_sync_at"
    t.string "name", null: false
    t.uuid "organization_connector_id", null: false
    t.uuid "project_id", null: false
    t.datetime "updated_at", null: false
    t.string "url"
    t.index ["organization_connector_id", "external_id"], name: "idx_repositories_connector_external", unique: true
    t.index ["organization_connector_id"], name: "index_repositories_on_organization_connector_id"
    t.index ["project_id"], name: "index_repositories_on_project_id"
  end

  create_table "sanitization_policies", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.jsonb "classification_rules", default: {}
    t.datetime "created_at", null: false
    t.datetime "effective_at"
    t.boolean "is_active", default: false, null: false
    t.string "name", null: false
    t.jsonb "sanitization_rules", default: {}
    t.datetime "updated_at", null: false
    t.integer "version", null: false
    t.index ["is_active"], name: "index_sanitization_policies_on_is_active", where: "(is_active = true)"
    t.index ["version"], name: "index_sanitization_policies_on_version", unique: true
  end

  create_table "user_settings", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "key", null: false
    t.datetime "updated_at", null: false
    t.uuid "user_id", null: false
    t.jsonb "value", default: {}
    t.index ["user_id", "key"], name: "index_user_settings_on_user_id_and_key", unique: true
    t.index ["user_id"], name: "index_user_settings_on_user_id"
  end

  create_table "user_tool_accounts", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.text "access_token"
    t.datetime "created_at", null: false
    t.string "external_account_id"
    t.string "external_account_name"
    t.string "external_email"
    t.string "external_user_id"
    t.string "external_username"
    t.boolean "is_active", default: true, null: false
    t.uuid "organization_membership_id", null: false
    t.text "refresh_token"
    t.datetime "token_expires_at"
    t.enum "tool_name", null: false, enum_type: "tool_name"
    t.datetime "updated_at", null: false
    t.index ["organization_membership_id", "tool_name"], name: "idx_user_tool_accounts_membership_tool", unique: true
    t.index ["organization_membership_id"], name: "index_user_tool_accounts_on_organization_membership_id"
  end

  create_table "users", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.string "avatar_url"
    t.datetime "created_at", null: false
    t.string "email", null: false
    t.boolean "global_admin", default: false, null: false
    t.string "keycloak_sub", null: false
    t.string "name"
    t.datetime "updated_at", null: false
    t.index ["email"], name: "index_users_on_email", unique: true
    t.index ["keycloak_sub"], name: "index_users_on_keycloak_sub", unique: true
  end

  add_foreign_key "admin_audit_logs", "users", column: "admin_user_id"
  add_foreign_key "audit_logs", "organizations"
  add_foreign_key "audit_logs", "sanitization_policies", column: "policy_version_id"
  add_foreign_key "organization_connectors", "organizations"
  add_foreign_key "organization_memberships", "organizations"
  add_foreign_key "organization_memberships", "users"
  add_foreign_key "organization_retention_policies", "organizations"
  add_foreign_key "organization_retention_policies", "users", column: "updated_by_id"
  add_foreign_key "organization_settings", "organizations"
  add_foreign_key "project_memberships", "projects"
  add_foreign_key "project_memberships", "users"
  add_foreign_key "project_settings", "projects"
  add_foreign_key "projects", "organizations"
  add_foreign_key "projects", "users", column: "owner_id"
  add_foreign_key "repositories", "organization_connectors"
  add_foreign_key "repositories", "projects"
  add_foreign_key "user_settings", "users"
  add_foreign_key "user_tool_accounts", "organization_memberships"
end

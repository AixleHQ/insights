# frozen_string_literal: true

class AddOpenrouterWebhookFieldsToOrganizationConnectors < ActiveRecord::Migration[8.1]
  def change
    # SHA-256 hex digest of access_token. Used to route incoming OpenRouter
    # Broadcast Webhook traces to the correct OrganizationConnector without
    # exposing the raw API key. Populated by a before_save callback on the model.
    add_column :organization_connectors, :key_hash, :string

    # When true, the OpenRouter connector is receiving per-request traces via
    # the Broadcast Webhook endpoint. AiUsageSyncJob skips Activity API polling
    # for these connectors to avoid double-counting.
    add_column :organization_connectors, :webhook_active, :boolean, default: false, null: false

    add_index :organization_connectors, :key_hash,
              where: "key_hash IS NOT NULL",
              name: "idx_organization_connectors_key_hash"
  end
end

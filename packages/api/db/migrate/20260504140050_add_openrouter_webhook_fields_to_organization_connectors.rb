# frozen_string_literal: true

class AddOpenrouterWebhookFieldsToOrganizationConnectors < ActiveRecord::Migration[8.1]
  def change
    # key_hash (SHA-256 of access_token) was the original approach for routing
    # incoming OpenRouter webhook payloads to the correct connector.
    # It was superseded by webhook_token in migration 20260504125319 because
    # OpenRouter's OTLP payload does not include any API-key identifier, making
    # key_hash-based routing unviable. key_hash is removed by that migration.
    add_column :organization_connectors, :key_hash, :string

    # When true, the connector is receiving per-request traces via the Broadcast
    # Webhook endpoint. AiUsageSyncJob skips Activity API polling for these
    # connectors to avoid double-counting daily-aggregate vs per-request events.
    add_column :organization_connectors, :webhook_active, :boolean, default: false, null: false

    add_index :organization_connectors, :key_hash,
              where: "key_hash IS NOT NULL",
              name: "idx_organization_connectors_key_hash"
  end
end

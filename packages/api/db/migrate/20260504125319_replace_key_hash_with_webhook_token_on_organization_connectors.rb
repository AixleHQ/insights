# frozen_string_literal: true

class ReplaceKeyHashWithWebhookTokenOnOrganizationConnectors < ActiveRecord::Migration[8.1]
  def up
    # Drop the key_hash column and its index — key_hash was SHA-256(access_token)
    # intended for routing webhook payloads, but OpenRouter's OTLP payload does
    # not include any API-key identifier. Routing via key_hash is not viable.
    remove_index :organization_connectors, name: "idx_organization_connectors_key_hash", if_exists: true
    remove_column :organization_connectors, :key_hash, if_exists: true

    # Replace with a per-connector webhook token embedded in the webhook URL.
    # OpenRouter allows configuring a custom webhook URL, so each connector gets
    # a unique URL: /api/v1/webhooks/openrouter_traces/:webhook_token
    # This gives unambiguous routing without requiring anything from the payload.
    add_column :organization_connectors, :webhook_token, :string

    add_index :organization_connectors, :webhook_token,
              unique: true,
              where: "webhook_token IS NOT NULL",
              name: "idx_organization_connectors_webhook_token"
  end

  def down
    remove_index :organization_connectors, name: "idx_organization_connectors_webhook_token", if_exists: true
    remove_column :organization_connectors, :webhook_token, if_exists: true

    add_column :organization_connectors, :key_hash, :string
    add_index :organization_connectors, :key_hash,
              where: "key_hash IS NOT NULL",
              name: "idx_organization_connectors_key_hash"
  end
end

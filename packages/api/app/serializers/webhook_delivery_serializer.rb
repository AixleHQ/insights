# frozen_string_literal: true

class WebhookDeliverySerializer < BaseSerializer
  attributes :id, :organization_connector_id, :provider, :event_type, :raw_event_key,
             :status, :attempts, :last_error

  datetime_attribute :last_attempted_at
  datetime_attribute :delivered_at
  timestamps
end

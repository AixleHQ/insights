# frozen_string_literal: true

class ConnectorEventDedup < ApplicationRecord
  self.table_name = "connector_event_dedup"

  belongs_to :organization
end

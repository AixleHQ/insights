# frozen_string_literal: true

class EventText < ApplicationRecord
  self.table_name = "timeseries.event_texts"

  # Composite PK (tool_event_id, occurred_at) lives in SQL schema.
  # Do not assume single-key lookups in service/controller code.

  validates :tool_event_id, presence: true
  validates :occurred_at, presence: true
end

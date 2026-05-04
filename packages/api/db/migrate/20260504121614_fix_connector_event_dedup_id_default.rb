# frozen_string_literal: true

# The connector_event_dedup table was created with id: :bigserial, but the
# sequence default was not attached to the column (column_default is nil in
# information_schema). This causes PG::NotNullViolation when inserting rows
# without an explicit id. This migration re-attaches the sequence.
class FixConnectorEventDedupIdDefault < ActiveRecord::Migration[8.1]
  def up
    execute <<~SQL
      ALTER TABLE connector_event_dedup
        ALTER COLUMN id SET DEFAULT nextval('connector_event_dedup_id_seq'::regclass);
    SQL
  end

  def down
    execute <<~SQL
      ALTER TABLE connector_event_dedup
        ALTER COLUMN id DROP DEFAULT;
    SQL
  end
end

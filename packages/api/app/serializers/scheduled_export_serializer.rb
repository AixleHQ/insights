# frozen_string_literal: true

class ScheduledExportSerializer < BaseSerializer
  attributes :id, :organization_id, :report_type, :format, :frequency,
             :day_of_week, :day_of_month, :recipients, :group_by, :active
  datetime_attribute :last_run_at
  datetime_attribute :next_run_at
  timestamps
end

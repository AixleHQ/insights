# frozen_string_literal: true

class RetentionPurgeLogSerializer < BaseSerializer
  attributes :id, :organization_id, :project_id, :retention_policy_type,
             :retention_days_applied, :records_deleted, :status, :error_message

  datetime_attribute :cutoff_timestamp
  datetime_attribute :job_run_at
  datetime_attribute :created_at
end

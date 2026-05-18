# frozen_string_literal: true

class RetentionPurgeLog < ApplicationRecord
  belongs_to :organization
  belongs_to :project, optional: true

  enum :retention_policy_type, { org: 0, project: 1 }
  enum :status, { success: 0, partial: 1, failed: 2 }

  validates :retention_days_applied, :cutoff_timestamp, :job_run_at, presence: true
  validates :records_deleted, presence: true, numericality: { greater_than_or_equal_to: 0 }

  before_update { raise ActiveRecord::ReadOnlyRecord, "retention_purge_logs is append-only" }
  before_destroy { raise ActiveRecord::ReadOnlyRecord, "retention_purge_logs is append-only" }
end

# frozen_string_literal: true

class DataRetentionPurgeJob
  include Sidekiq::Job

  sidekiq_options queue: "maintenance", retry: 3

  BATCH_SIZE_ENV = "RETENTION_PURGE_BATCH_SIZE"
  DEFAULT_BATCH_SIZE = 1000
  BATCH_SLEEP_SECONDS = 0.05

  def perform
    Rails.logger.info("[DataRetentionPurgeJob] Starting retention purge...")

    stats = { organizations_processed: 0, total_deleted: 0, errors: [] }

    Organization.find_each do |org|
      begin
        deleted = purge_organization(org)
        stats[:organizations_processed] += 1
        stats[:total_deleted] += deleted
      rescue => e
        stats[:errors] << { organization_id: org.id, error: e.message }
        Rails.logger.error("[DataRetentionPurgeJob] Error purging org #{org.id}: #{e.message}")
        write_purge_log_on_error(org: org, error: e)
      end
    end

    Rails.logger.info(
      "[DataRetentionPurgeJob] Completed. " \
      "Orgs: #{stats[:organizations_processed]}, " \
      "Deleted: #{stats[:total_deleted]}, " \
      "Errors: #{stats[:errors].size}"
    )

    stats
  end

  private

  def purge_organization(org)
    org_cutoff = RetentionService.retention_cutoff(org, :tool_events_retention)
    return 0 unless org_cutoff

    total_deleted = 0

    # Delete per-project events applying the strictest (most recent) cutoff
    org.projects.includes(:retention_policy).find_each do |project|
      project_cutoff = project_cutoff_for(project)
      cutoff = strictest_cutoff(org_cutoff, project_cutoff)
      next unless cutoff

      scope = ToolEvent.where(organization_id: org.id, project_id: project.id)
      deleted = batch_delete_events(scope: scope, cutoff: cutoff)

      if deleted > 0
        Rails.logger.info(
          "[DataRetentionPurgeJob] Org #{org.id}, Project #{project.id}: " \
          "deleted #{deleted} tool_events older than #{cutoff}"
        )
      end

      write_purge_log(org: org, project: project, records_deleted: deleted, cutoff: cutoff, status: :success)

      total_deleted += deleted
    end

    # Delete events not belonging to any project (project_id IS NULL)
    scope = ToolEvent.where(organization_id: org.id, project_id: nil)
    deleted = batch_delete_events(scope: scope, cutoff: org_cutoff)

    if deleted > 0
      Rails.logger.info(
        "[DataRetentionPurgeJob] Org #{org.id}, no project: " \
        "deleted #{deleted} tool_events older than #{org_cutoff}"
      )
    end

    write_purge_log(org: org, project: nil, records_deleted: deleted, cutoff: org_cutoff, status: :success)

    total_deleted += deleted
    total_deleted
  end

  def batch_delete_events(scope:, cutoff:)
    deleted_total = 0
    batch_size = (ENV[BATCH_SIZE_ENV] || DEFAULT_BATCH_SIZE).to_i

    loop do
      # Fetch id+occurred_at together so TimescaleDB can use chunk exclusion on deletion
      batch = scope
        .where("occurred_at < ?", cutoff)
        .limit(batch_size)
        .pluck(:id, :occurred_at)
      break if batch.empty?

      ids = batch.map(&:first)

      AuditLog.where(tool_event_id: ids).update_all(tool_event_id: nil)
      ConnectorEventDedup.where(tool_event_id: ids).delete_all

      # Include occurred_at in the WHERE clause so TimescaleDB can use chunk exclusion
      # and correctly locate rows across hypertable partitions.
      occurred_ats = batch.map(&:last)
      deleted = ToolEvent
        .where(id: ids)
        .where(occurred_at: occurred_ats)
        .delete_all

      deleted_total += deleted
      sleep(BATCH_SLEEP_SECONDS)
    end

    deleted_total
  end

  def project_cutoff_for(project)
    policy = project.retention_policy
    return nil unless policy

    duration = policy.tool_events_retention_duration
    return nil unless duration

    duration.ago
  end

  def strictest_cutoff(org_cutoff, project_cutoff)
    return org_cutoff if project_cutoff.nil?
    return project_cutoff if org_cutoff.nil?
    # A more recent cutoff date means a shorter retention window (stricter).
    # E.g. 30.days.ago is stricter than 180.days.ago because it deletes more data.
    [ org_cutoff, project_cutoff ].max
  end

  def write_purge_log(org:, project:, records_deleted:, cutoff:, status:, error_message: nil)
    days_applied = ((Time.current - cutoff) / 1.day).round
    RetentionPurgeLog.create!(
      organization: org,
      project: project,
      retention_policy_type: project ? :project : :org,
      retention_days_applied: days_applied,
      cutoff_timestamp: cutoff,
      records_deleted: records_deleted,
      job_run_at: Time.current,
      status: status,
      error_message: error_message
    )
  rescue => e
    Rails.logger.error("[DataRetentionPurgeJob] Failed to write purge log for org #{org.id}: #{e.message}")
  end

  def write_purge_log_on_error(org:, error:)
    RetentionPurgeLog.create!(
      organization: org,
      project: nil,
      retention_policy_type: :org,
      retention_days_applied: 0,
      cutoff_timestamp: Time.current,
      records_deleted: 0,
      job_run_at: Time.current,
      status: :failed,
      error_message: error.message
    )
  rescue => e
    Rails.logger.error("[DataRetentionPurgeJob] Failed to write error purge log for org #{org.id}: #{e.message}")
  end
end

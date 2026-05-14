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
        enqueue_audit_log(org, deleted)
      rescue => e
        stats[:errors] << { organization_id: org.id, error: e.message }
        Rails.logger.error("[DataRetentionPurgeJob] Error purging org #{org.id}: #{e.message}")
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

  def enqueue_audit_log(org, records_deleted)
    # PurgeAuditLogJob is implemented in AIX-210
    return unless defined?(PurgeAuditLogJob)

    PurgeAuditLogJob.perform_async(
      org_id: org.id,
      records_deleted: records_deleted,
      cutoff_timestamp: RetentionService.retention_cutoff(org, :tool_events_retention)&.iso8601
    )
  end
end

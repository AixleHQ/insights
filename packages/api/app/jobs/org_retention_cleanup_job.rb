class OrgRetentionCleanupJob
  include Sidekiq::Job

  sidekiq_options queue: 'maintenance', retry: 3

  def perform
    Rails.logger.info('[OrgRetentionCleanupJob] Starting retention cleanup...')

    stats = { organizations_processed: 0, total_deleted: 0, errors: [] }

    Organization.find_each do |org|
      begin
        deleted = cleanup_organization(org)
        stats[:organizations_processed] += 1
        stats[:total_deleted] += deleted
      rescue => e
        stats[:errors] << { organization_id: org.id, error: e.message }
        Rails.logger.error("[OrgRetentionCleanupJob] Error cleaning org #{org.slug}: #{e.message}")
      end
    end

    Rails.logger.info("[OrgRetentionCleanupJob] Completed. Processed: #{stats[:organizations_processed]}, Deleted: #{stats[:total_deleted]}, Errors: #{stats[:errors].size}")
    stats
  end

  private

  def cleanup_organization(org)
    total_deleted = 0

    # Clean up tool_events
    total_deleted += cleanup_tool_events(org)

    # Clean up hourly aggregates (if we had direct access - normally handled by TimescaleDB)
    # total_deleted += cleanup_hourly_aggregates(org)

    total_deleted
  end

  def cleanup_tool_events(org)
    cutoff = RetentionService.retention_cutoff(org, :tool_events_retention)
    return 0 unless cutoff

    deleted = ToolEvent
      .where(organization_id: org.id)
      .where('occurred_at < ?', cutoff)
      .delete_all

    if deleted > 0
      Rails.logger.info("[OrgRetentionCleanupJob] Org #{org.slug}: deleted #{deleted} tool_events older than #{cutoff}")
    end

    deleted
  end
end

# frozen_string_literal: true

# Backfills audit_logs for tool_events that have a risk_level in metadata but no
# corresponding audit_log record. This covers events that:
#   - Went through the Temporal fallback path (direct insert, no audit_log)
#   - Had audit_log creation fail after tool_event was persisted
#   - Were created by AiUsageSyncJob (provider polling, no classification pipeline)
#
# For provider-polled events without metadata risk_level, creates a "none" audit_log
# to mark them as classified (no content to scan = no risk).
#
# Idempotent: safe to run multiple times; only processes events without existing audit_logs.
class PostSyncClassificationJob
  include Sidekiq::Job

  sidekiq_options queue: "ai", retry: 2

  BATCH_SIZE = 500
  MAX_EVENTS = 10_000

  def perform
    metadata_count = backfill_from_metadata
    provider_count = backfill_provider_events

    Rails.logger.info(
      "[PostSyncClassificationJob] Backfilled #{metadata_count} from metadata, " \
      "#{provider_count} provider events (risk_level=none)"
    )
  end

  private

  def backfill_from_metadata
    count = 0
    unclassified_events
      .where("tool_events.metadata->>'risk_level' IS NOT NULL")
      .where("tool_events.metadata->>'risk_level' NOT IN ('', 'none')")
      .limit(MAX_EVENTS)
      .in_batches(of: BATCH_SIZE) do |batch|
        rows = batch.map { |event| audit_row_from_metadata(event) }
        AuditLog.insert_all(rows) if rows.any?
        count += rows.size
      end
    count
  end

  def backfill_provider_events
    count = 0
    unclassified_events
      .where("tool_events.metadata->>'risk_level' IS NULL OR tool_events.metadata->>'risk_level' IN ('', 'none')")
      .where(occurred_at: 30.days.ago..)
      .limit(MAX_EVENTS)
      .in_batches(of: BATCH_SIZE) do |batch|
        rows = batch.map { |event| audit_row_none(event) }
        AuditLog.insert_all(rows) if rows.any?
        count += rows.size
      end
    count
  end

  def unclassified_events
    ToolEvent
      .left_joins(:audit_logs)
      .where(audit_logs: { id: nil })
  end

  def audit_row_from_metadata(event)
    level = event.metadata&.dig("risk_level") || "none"
    level = "none" unless AuditLog::RISK_LEVELS.include?(level)

    {
      tool_event_id: event.id,
      organization_id: event.organization_id,
      raw_event_key: "backfill/#{event.id}",
      risk_level: level,
      confidence_score: level == "none" ? 1.0 : 0.8,
      classification_labels: pg_array([]),
      sanitization_actions: pg_array([]),
      metadata: { source: "post_sync_classification", backfilled_at: Time.current.iso8601 },
      created_at: Time.current
    }
  end

  def audit_row_none(event)
    {
      tool_event_id: event.id,
      organization_id: event.organization_id,
      raw_event_key: "provider_sync/#{event.id}",
      risk_level: "none",
      confidence_score: 1.0,
      classification_labels: pg_array([]),
      sanitization_actions: pg_array([]),
      metadata: { source: "post_sync_classification", no_content: true },
      created_at: Time.current
    }
  end

  def pg_array(arr)
    "{#{arr.join(',')}}"
  end
end

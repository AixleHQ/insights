class ConnectorHealthSnapshot < ApplicationRecord
  RETENTION_WINDOW = 90.days
  STATUSES = %w[success failure].freeze

  belongs_to :organization_connector

  validates :status, presence: true, inclusion: { in: STATUSES }
  validates :snapshotted_at, presence: true

  # Returns a hash keyed by organization_connector_id with aggregated 7-day stats.
  # Single GROUP BY query — no N+1. Scoped to org_id to prevent cross-org leakage.
  def self.stats_for_org(org_id, since:)
    rows = joins(:organization_connector)
      .where(organization_connectors: { organization_id: org_id })
      .where("snapshotted_at >= ?", since)
      .group(:organization_connector_id)
      .select(
        :organization_connector_id,
        "COUNT(CASE WHEN connector_health_snapshots.status = 'success' THEN 1 END) AS success_count",
        "COUNT(CASE WHEN connector_health_snapshots.status = 'failure' THEN 1 END) AS failure_count",
        "AVG(sync_duration_ms) AS avg_duration_ms",
        "MAX(snapshotted_at) AS last_snapshotted_at"
      )

    rows.each_with_object({}) do |row, hash|
      hash[row.organization_connector_id] = {
        success_count: row.success_count.to_i,
        failure_count: row.failure_count.to_i,
        avg_duration_ms: row.avg_duration_ms&.to_f,
        last_snapshotted_at: row.last_snapshotted_at
      }
    end
  end
end

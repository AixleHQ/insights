# frozen_string_literal: true

# Background job for exporting ToolEvents to CSV when the result set exceeds
# EventsController::EXPORT_ROW_CAP (100,000 rows).
#
# Stores the generated CSV in Redis keyed by org_id + user_id + jid so that
# EventExportJobsController#download can verify ownership before streaming.
class ToolEventExportJob
  include Sidekiq::Job
  include ToolEventFilterable

  JOB_TTL    = 24.hours.to_i
  KEY_PREFIX = "db90:export"

  # @param filter_params [Hash]   permitted filter keys (string keys from JSON serialization)
  # @param user_id       [String] UUID of requesting user
  # @param org_id        [String] UUID of organization
  # @param role_str      [String] "member" | "org_admin" | "global_admin"
  def perform(filter_params, user_id, org_id, role_str)
    set_status(user_id, org_id, "pending")

    user = User.find(user_id)
    org  = Organization.find(org_id)
    role = role_str.to_sym
    fp   = filter_params.transform_keys(&:to_s)

    events = org.tool_events
    events = events.where(user_id: user.id) unless role.in?(%i[org_admin global_admin])
    events = apply_tool_event_filters(events, fp)
             .includes(:user, :project)
             .order(occurred_at: :desc)

    summary_lines = ToolEventCsvExporter.filter_summary_lines_for_export(fp, organization: org)
    csv = ToolEventCsvExporter.generate(events, role, filter_summary_lines: summary_lines)

    REDIS.setex(data_key(user_id, org_id), JOB_TTL, csv)
    set_status(user_id, org_id, "complete")
  rescue => e
    set_status(user_id, org_id, "failed")
    raise
  end

  # Redis key helpers — scoped to (user_id, org_id, jid) to prevent cross-user access
  def self.status_key(user_id, org_id, jid)
    "#{KEY_PREFIX}:#{org_id}:#{user_id}:#{jid}:status"
  end

  def self.data_key(user_id, org_id, jid)
    "#{KEY_PREFIX}:#{org_id}:#{user_id}:#{jid}:data"
  end

  private

  def status_key(user_id, org_id)
    self.class.status_key(user_id, org_id, jid)
  end

  def data_key(user_id, org_id)
    self.class.data_key(user_id, org_id, jid)
  end

  def set_status(user_id, org_id, status)
    REDIS.setex(status_key(user_id, org_id), JOB_TTL, status)
  end
end

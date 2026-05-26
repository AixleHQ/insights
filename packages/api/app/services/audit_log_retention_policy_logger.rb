# frozen_string_literal: true

class AuditLogRetentionPolicyLogger
  ALERT_KEYS = %w[cost_threshold_cents token_threshold alert_enabled].freeze
  RETENTION_KEYS = %w[
    raw_event_ttl
    tool_events_retention
    hourly_aggregate_retention
    daily_aggregate_retention
    retention_reason
  ].freeze

  def self.log!(organization: nil, project: nil, actor:, policy:, param_keys:, changes_before:, request:)
    keys = param_keys.map(&:to_s)
    after = policy.attributes.slice(*keys)

    retention_keys = keys & RETENTION_KEYS
    alert_keys = keys & ALERT_KEYS

    if retention_keys.any?
      log_entry(
        organization: organization,
        project: project,
        actor: actor,
        action: "retention.update",
        policy: policy,
        before: changes_before.stringify_keys.slice(*retention_keys),
        after: after.slice(*retention_keys),
        request: request
      )
    end

    return unless alert_keys.any?

    log_entry(
      organization: organization,
      project: project,
      actor: actor,
      action: "alert.update",
      policy: policy,
      before: changes_before.stringify_keys.slice(*alert_keys),
      after: after.slice(*alert_keys),
      request: request
    )
  end

  def self.log_entry(organization:, project:, actor:, action:, policy:, before:, after:, request:)
    raise ArgumentError, "organization or project required" if project.nil? && organization.nil?

    tracked_changes = { before: before, after: after }

    if project
      ProjectAuditLog.log(
        project: project,
        actor: actor,
        action: action,
        resource: policy,
        tracked_changes: tracked_changes,
        request: request
      )
    elsif organization
      OrganizationAuditLog.log(
        organization: organization,
        actor: actor,
        action: action,
        resource: policy,
        tracked_changes: tracked_changes,
        request: request
      )
    end
  end

  private_class_method :log_entry
end

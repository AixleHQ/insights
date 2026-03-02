# frozen_string_literal: true

class AuditLogSerializer < BaseSerializer
  attributes :id, :organization_id, :tool_event_id,
             :risk_level, :temporal_workflow_id,
             :raw_event_key, :confidence_score,
             :classification_labels, :sanitization_actions

  datetime_attribute :created_at

  attribute :high_risk do |audit_log|
    audit_log.high_risk?
  end

  attribute :detection_summary do |audit_log|
    audit_log.metadata&.dig("detection_summary")
  end

  attribute :sanitization_changes do |audit_log|
    audit_log.metadata&.dig("sanitization_changes")
  end

  attribute :risk_score do |audit_log|
    audit_log.metadata&.dig("risk_score")
  end

  attribute :policy_version do |audit_log|
    if audit_log.policy_version
      {
        id: audit_log.policy_version.id,
        name: audit_log.policy_version.name,
        version: audit_log.policy_version.version
      }
    end
  end
end

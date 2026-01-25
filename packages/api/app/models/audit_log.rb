class AuditLog < ApplicationRecord
  RISK_LEVELS = %w[low medium high critical].freeze

  belongs_to :organization
  belongs_to :policy_version, class_name: 'SanitizationPolicy', optional: true
  belongs_to :tool_event, class_name: 'ToolEvent', optional: true

  validates :raw_event_key, presence: true
  validates :risk_level, presence: true, inclusion: { in: RISK_LEVELS }
  validates :confidence_score, numericality: { greater_than_or_equal_to: 0, less_than_or_equal_to: 1 }, allow_nil: true

  scope :by_risk_level, ->(level) { where(risk_level: level) }
  scope :high_risk, -> { where(risk_level: %w[high critical]) }
  scope :with_workflow, ->(workflow_id) { where(temporal_workflow_id: workflow_id) }

  def high_risk?
    risk_level.in?(%w[high critical])
  end

  def linked_to_event?
    tool_event_id.present?
  end
end

class ToolEvent < ApplicationRecord
  self.table_name = "timeseries.tool_events"
  self.primary_key = "id"

  TOOL_NAMES = %w[
    claude_code cursor windsurf github_copilot
    aider continue cody tabnine amazon_q
    openrouter anthropic_api openai_api gemini_api
    custom
  ].freeze

  EVENT_TYPES = %w[chat completion edit commit review test debug refactor documentation other].freeze

  belongs_to :user, optional: true
  belongs_to :organization
  belongs_to :project, optional: true
  belongs_to :repository, optional: true
  has_one :audit_log, dependent: :nullify

  validates :tool_name, presence: true, inclusion: { in: TOOL_NAMES }
  validates :event_type, presence: true, inclusion: { in: EVENT_TYPES }
  validates :occurred_at, presence: true
  validates :tokens_in, numericality: { only_integer: true, greater_than_or_equal_to: 0 }, allow_nil: true
  validates :tokens_out, numericality: { only_integer: true, greater_than_or_equal_to: 0 }, allow_nil: true
  validates :tokens_total, numericality: { only_integer: true, greater_than_or_equal_to: 0 }, allow_nil: true
  validates :cost_usd, numericality: { greater_than_or_equal_to: 0 }, allow_nil: true

  before_validation :calculate_tokens_total

  scope :by_tool, ->(tool) { where(tool_name: tool) }
  scope :by_event_type, ->(type) { where(event_type: type) }
  scope :in_range, ->(start_time, end_time) { where(occurred_at: start_time..end_time) }
  scope :for_user, ->(user) { where(user: user) }
  scope :for_organization, ->(org) { where(organization: org) }
  scope :for_project, ->(project) { where(project: project) }

  def self.total_tokens_in_range(start_time, end_time)
    in_range(start_time, end_time).sum(:tokens_total)
  end

  def self.total_cost_in_range(start_time, end_time)
    in_range(start_time, end_time).sum(:cost_usd)
  end

  private

  def calculate_tokens_total
    self.tokens_total = (tokens_in || 0) + (tokens_out || 0) if tokens_total.blank?
  end
end

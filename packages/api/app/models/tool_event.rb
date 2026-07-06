class ToolEvent < ApplicationRecord
  self.table_name = "timeseries.tool_events"
  self.primary_key = "id"

  TOOL_NAMES = %w[
    claude_code cursor windsurf github_copilot
    aider continue cody tabnine amazon_q
    openrouter_api anthropic_api openai_api gemini_api
    custom jira linear github gitlab bitbucket
  ].freeze

  EVENT_TYPES = %w[chat completion edit commit review test debug refactor documentation other
                   issue comment sprint tool_use].freeze

  belongs_to :user, optional: true
  belongs_to :organization
  belongs_to :project, optional: true
  belongs_to :repository, optional: true
  has_many :audit_logs, dependent: :nullify

  validates :tool_name, presence: true, inclusion: { in: TOOL_NAMES }
  validates :event_type, presence: true, inclusion: { in: EVENT_TYPES }
  validates :occurred_at, presence: true
  validates :model, format: { with: ModelStringNormalizer::MODEL_FORMAT,
                               message: "contains invalid characters" }, allow_nil: true, allow_blank: true
  validates :tokens_in, numericality: { only_integer: true, greater_than_or_equal_to: 0 }, allow_nil: true
  validates :tokens_out, numericality: { only_integer: true, greater_than_or_equal_to: 0 }, allow_nil: true
  validates :tokens_total, numericality: { only_integer: true, greater_than_or_equal_to: 0 }, allow_nil: true
  validates :cost_usd, numericality: { greater_than_or_equal_to: 0 }, allow_nil: true

  before_validation :normalize_model
  before_validation :calculate_tokens_total

  scope :by_tool, ->(tool) { where(tool_name: tool) }
  scope :by_event_type, ->(type) { where(event_type: type) }
  scope :in_range, ->(start_time, end_time) { where(occurred_at: start_time..end_time) }
  scope :for_user, ->(user) { where(user: user) }
  scope :for_organization, ->(org) { where(organization: org) }
  scope :for_project, ->(project) { where(project: project) }
  scope :before_cutoff, ->(cutoff) { where("occurred_at < ?", cutoff) }

  def self.total_tokens_in_range(start_time, end_time)
    in_range(start_time, end_time).sum(:tokens_total)
  end

  def self.total_cost_in_range(start_time, end_time)
    in_range(start_time, end_time).sum(:cost_usd)
  end

  private

  # Self-heals the model column on every save so legacy/out-of-band rows
  # (console, admin scripts, future jobs) can't trip the format validation
  # with a stale value. Ingest via ToolEvents::Upsert already normalises, but
  # this guarantees the invariant for any AR write path. Only rewrites when the
  # value actually changes to avoid touching untouched records needlessly.
  def normalize_model
    return if model.nil?

    normalized = ModelStringNormalizer.normalize(model)
    self.model = normalized unless normalized == model
  end

  def calculate_tokens_total
    self.tokens_total = (tokens_in || 0) + (tokens_out || 0)
  end
end

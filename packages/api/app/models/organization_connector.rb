class OrganizationConnector < ApplicationRecord
  CONNECTOR_TYPES = %w[github gitlab bitbucket jira linear openrouter anthropic openai gemini slack github_copilot].freeze
  STATUSES = %w[connected testing error disconnected].freeze

  belongs_to :organization
  has_many :repositories, dependent: :destroy

  validates :connector_type, presence: true, inclusion: { in: CONNECTOR_TYPES }
  validates :connector_type, uniqueness: { scope: :organization_id, message: "already exists for this organization" }
  validates :is_active, inclusion: { in: [ true, false ] }
  validates :status, inclusion: { in: STATUSES }

  encrypts :access_token
  encrypts :refresh_token
  encrypts :webhook_secret

  scope :active, -> { where.not(status: "disconnected") }
  scope :by_type, ->(type) { where(connector_type: type) }

  def token_expired?
    return false if token_expires_at.nil?
    token_expires_at < Time.current
  end

  def source_control?
    connector_type.in?(%w[github gitlab bitbucket])
  end

  def project_management?
    connector_type.in?(%w[jira linear])
  end

  def ai_provider?
    connector_type.in?(%w[openrouter anthropic openai gemini])
  end

  def copilot?
    connector_type == "github_copilot"
  end

  def slack_webhook?
    connector_type == "slack"
  end

  def mark_testing!
    update!(status: "testing", last_error: nil)
  end

  def mark_connected!
    update!(status: "connected", last_error: nil, last_sync_at: Time.current, is_active: true)
  end

  def mark_synced!
    update!(status: "connected", last_sync_at: Time.current, last_error: nil, is_active: true)
  end

  def mark_error!(error_message)
    update!(status: "error", last_error: error_message)
  end

  def mark_disconnected!
    update!(status: "disconnected", is_active: false)
  end

  # Returns the tool_name used in ToolEvent for this connector, or nil if not applicable.
  # Only AI provider connectors produce tool events (e.g. openrouter → openrouter_api).
  # Source control and project management connectors do not generate tool events.
  def tool_event_name
    return "github_copilot" if copilot?
    "#{connector_type}_api" if ai_provider?
  end
end

class OrganizationConnector < ApplicationRecord
  CONNECTOR_TYPES = %w[github gitlab bitbucket jira linear openrouter anthropic openai gemini].freeze

  belongs_to :organization
  has_many :repositories, dependent: :destroy

  validates :connector_type, presence: true, inclusion: { in: CONNECTOR_TYPES }
  validates :connector_type, uniqueness: { scope: :organization_id, message: 'already exists for this organization' }
  validates :is_active, inclusion: { in: [true, false] }

  encrypts :access_token
  encrypts :refresh_token
  encrypts :webhook_secret

  scope :active, -> { where(is_active: true) }
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

  def mark_synced!
    update!(last_sync_at: Time.current, last_error: nil)
  end

  def mark_error!(error_message)
    update!(last_error: error_message)
  end
end

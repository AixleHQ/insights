class UserToolAccount < ApplicationRecord
  TOOL_NAMES = %w[
    claude_code cursor windsurf github_copilot
    aider continue cody tabnine amazon_q
    openrouter anthropic_api openai_api gemini_api
    custom
  ].freeze

  belongs_to :organization_membership
  has_one :user, through: :organization_membership
  has_one :organization, through: :organization_membership

  validates :tool_name, presence: true, inclusion: { in: TOOL_NAMES }
  validates :tool_name, uniqueness: { scope: :organization_membership_id, message: "account already exists for this membership" }
  validates :is_active, inclusion: { in: [ true, false ] }

  encrypts :access_token
  encrypts :refresh_token

  INGEST_TOOLS = %w[claude_code cursor].freeze

  scope :active, -> { where(is_active: true) }
  scope :by_tool, ->(tool) { where(tool_name: tool) }

  attr_reader :plaintext_token

  before_create :generate_ingest_token, if: :ingest_tool?

  def self.find_by_ingest_token(raw_token)
    return nil if raw_token.blank?
    find_by(token_hash: Digest::SHA256.hexdigest(raw_token))
  end

  def token_expired?
    return false if token_expires_at.nil?
    token_expires_at < Time.current
  end

  private

  def ingest_tool?
    INGEST_TOOLS.include?(tool_name)
  end

  def generate_ingest_token
    raw = "db90_#{SecureRandom.hex(32)}"
    self.access_token = raw
    self.token_hash = Digest::SHA256.hexdigest(raw)
    @plaintext_token = raw
  end
end

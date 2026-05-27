class UserToolAccount < ApplicationRecord
  include ToolStateMachine

  TOOL_NAMES = %w[
    claude_code cursor windsurf github_copilot
    aider continue cody tabnine amazon_q
    openrouter_api anthropic_api openai_api gemini_api
    custom
  ].freeze

  belongs_to :organization_membership
  has_one :user, through: :organization_membership
  has_one :organization, through: :organization_membership

  validates :tool_name, presence: true, inclusion: { in: TOOL_NAMES }
  validates :tool_name, uniqueness: { scope: :organization_membership_id, message: "account already exists for this membership" }
  validates :connection_state, inclusion: { in: %w[inactive active waiting_for_connection] }
  validates :connector_scope, inclusion: { in: %w[persona] }

  before_validation :assign_scope, on: :create
  before_validation :assign_default_connection_state, on: :create

  encrypts :access_token
  encrypts :refresh_token

  INGEST_TOOLS = %w[claude_code cursor].freeze

  scope :active, -> { where(connection_state: "active") }
  scope :by_tool, ->(tool) { where(tool_name: tool) }

  validates :token_hash, presence: true, if: :ingest_tool?

  attr_reader :plaintext_token

  before_validation :generate_ingest_token, if: -> { ingest_tool? && token_hash.blank? }, on: :create

  def ingest_tool?
    INGEST_TOOLS.include?(tool_name)
  end

  def self.find_by_ingest_token(raw_token)
    return nil if raw_token.blank?
    find_by(token_hash: Digest::SHA256.hexdigest(raw_token))
  end

  def rotate_ingest_token!
    raw = new_raw_token
    update!(access_token: raw, token_hash: Digest::SHA256.hexdigest(raw))
    @plaintext_token = raw
    self
  end

  def token_expired?
    return false if token_expires_at.nil?
    token_expires_at < Time.current
  end

  private

  def assign_scope
    self.connector_scope = "persona"
  end

  def assign_default_connection_state
    return if connection_state.present?

    self.connection_state = ingest_tool? ? "waiting_for_connection" : "active"
  end

  def generate_ingest_token
    raw = new_raw_token
    self.access_token = raw
    self.token_hash = Digest::SHA256.hexdigest(raw)
    @plaintext_token = raw
  end

  def new_raw_token
    "db90_#{SecureRandom.hex(32)}"
  end
end

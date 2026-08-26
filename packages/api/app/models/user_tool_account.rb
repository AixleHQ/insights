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

  # SECURITY (OWASP A02-2, AIX-371): token_hash is an unsalted SHA-256 digest
  # of the raw ingest token, looked up directly by hash value. This is a
  # deliberate choice, not an oversight:
  #
  # - Ingest tokens are `aixle_<SecureRandom.hex(32)>` — 256 bits of entropy,
  #   generated server-side. They are nothing like user-chosen passwords.
  # - Salted, slow hashing (bcrypt/argon2) exists to defeat *offline guessing*
  #   of low-entropy secrets. Against a uniformly random 256-bit value, a
  #   2^256 search space is infeasible regardless of hash speed or salting —
  #   a leaked token_hash column gives an attacker nothing they didn't already
  #   have to brute-force from scratch.
  # - `find_by_ingest_token` runs on the authentication hot path for every
  #   single Claude Code / Cursor tool-event ingestion request platform-wide.
  #   A salted scheme also can't be looked up directly by hash column (each
  #   row's salt differs), which would require a prefix-index + per-row verify
  #   redesign — real added latency and complexity for no measurable security
  #   gain here.
  # - This mirrors standard practice for long random API tokens (e.g. GitHub,
  #   Stripe, GitLab hash these with a fast hash, not bcrypt) as distinct from
  #   user passwords, which remain the case for actual credentials elsewhere.
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
    return if connection_state.present? && connection_state != "inactive"

    self.connection_state = ingest_tool? ? "waiting_for_connection" : "active"
  end

  def generate_ingest_token
    raw = new_raw_token
    self.access_token = raw
    self.token_hash = Digest::SHA256.hexdigest(raw)
    @plaintext_token = raw
  end

  def new_raw_token
    "aixle_#{SecureRandom.hex(32)}"
  end
end

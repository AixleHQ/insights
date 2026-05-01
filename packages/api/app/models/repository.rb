class Repository < ApplicationRecord
  belongs_to :project, optional: true
  belongs_to :organization_connector
  has_many :tool_events, class_name: "ToolEvent", dependent: :restrict_with_error

  validates :external_id, presence: true, uniqueness: { scope: :organization_connector_id }
  validates :name, presence: true
  validates :full_name, presence: true

  scope :private_repos, -> { where(is_private: true) }
  scope :public_repos, -> { where(is_private: false) }
  scope :recently_synced, -> { where("last_sync_at > ?", 1.hour.ago) }
  scope :linked, -> { where.not(project_id: nil) }

  def needs_sync?
    last_sync_at.nil? || last_sync_at < 1.hour.ago
  end

  def mark_synced!
    update!(last_sync_at: Time.current)
  end

  def provider
    organization_connector.connector_type
  end
end

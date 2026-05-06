# frozen_string_literal: true

class WebhookDelivery < ApplicationRecord
  STATUSES         = %w[pending processing delivered failed].freeze
  PROVIDERS        = %w[github gitlab bitbucket jira linear slack].freeze
  RETENTION_WINDOW = 30.days

  belongs_to :organization_connector
  has_one :organization, through: :organization_connector

  validates :provider,      presence: true, inclusion: { in: PROVIDERS }
  validates :event_type,    presence: true
  validates :raw_event_key, presence: true
  validates :status,        inclusion: { in: STATUSES }
  validates :attempts,      numericality: { greater_than_or_equal_to: 0 }

  scope :by_status,   ->(s)  { where(status: s) }
  scope :by_provider, ->(p)  { where(provider: p) }
  scope :failed,             -> { where(status: "failed") }
  scope :delivered,          -> { where(status: "delivered") }

  def mark_processing!
    update!(status: "processing", attempts: attempts + 1, last_attempted_at: Time.current)
  end

  def mark_delivered!
    update!(status: "delivered", delivered_at: Time.current)
  end

  def mark_failed!(error_message)
    update!(status: "failed", last_error: error_message)
  end
end

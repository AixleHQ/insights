# frozen_string_literal: true

class ExportRecord < ApplicationRecord
  REPORT_TYPES = %w[cost_by_user cost_by_project cost_by_tool token_by_user token_by_tool].freeze
  FORMATS      = %w[csv json].freeze

  belongs_to :organization
  belongs_to :created_by, class_name: "User"

  has_one_attached :file

  enum :status, {
    pending:    "pending",
    generating: "generating",
    ready:      "ready",
    failed:     "failed"
  }

  validates :report_type, inclusion: { in: REPORT_TYPES }
  validates :format,      inclusion: { in: FORMATS }
  validates :status,      presence: true

  scope :recent_first, -> { order(created_at: :desc) }

  def expired?
    expires_at&.past? || false
  end
end

class Notification < ApplicationRecord
  NOTIFICATION_TYPES = NotificationRoute::NOTIFICATION_TYPES

  belongs_to :user
  belongs_to :organization

  validates :notification_type, inclusion: { in: NOTIFICATION_TYPES }
  # presence: true rejects {} as blank; rely on DB null: false + default: {} for nil guard.
  validates :payload, exclusion: { in: [ nil ] }

  scope :unread, -> { where(read_at: nil) }
end

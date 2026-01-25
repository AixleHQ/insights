class SanitizationPolicy < ApplicationRecord
  has_many :audit_logs, foreign_key: :policy_version_id, dependent: :restrict_with_error

  validates :version, presence: true, uniqueness: true, numericality: { only_integer: true, greater_than: 0 }
  validates :name, presence: true
  validates :is_active, inclusion: { in: [true, false] }

  before_save :set_effective_at, if: -> { is_active_changed? && is_active? }
  after_save :deactivate_other_policies, if: -> { saved_change_to_is_active? && is_active? }

  scope :active, -> { where(is_active: true) }
  scope :by_version, -> { order(version: :desc) }

  def self.current
    active.first || by_version.first
  end

  def self.next_version
    (maximum(:version) || 0) + 1
  end

  def activate!
    update!(is_active: true)
  end

  def deactivate!
    update!(is_active: false)
  end

  private

  def set_effective_at
    self.effective_at = Time.current
  end

  def deactivate_other_policies
    SanitizationPolicy.where.not(id: id).update_all(is_active: false)
  end
end

# frozen_string_literal: true

class ScheduledExport < ApplicationRecord
  REPORT_TYPES = %w[cost_by_user cost_by_project cost_by_tool token_by_user token_by_tool].freeze
  FORMATS      = %w[csv json].freeze
  FREQUENCIES  = %w[daily weekly monthly].freeze
  GROUP_BY     = %w[day week month].freeze

  belongs_to :organization
  belongs_to :created_by, class_name: "User"

  validates :report_type, inclusion: { in: REPORT_TYPES }
  validates :format,      inclusion: { in: FORMATS }
  validates :frequency,   inclusion: { in: FREQUENCIES }
  validates :recipients,  presence: true
  validates :day_of_week,
            presence: true,
            numericality: { only_integer: true, in: 0..6 },
            if: -> { frequency == "weekly" }
  validates :day_of_month,
            presence: true,
            numericality: { only_integer: true, in: 1..28 },
            if: -> { frequency == "monthly" }
  validates :group_by,
            inclusion: { in: GROUP_BY },
            allow_blank: true

  before_validation :compute_next_run_at, on: :create

  def compute_next_run_at
    return if frequency.blank?
    return if frequency == "weekly"  && day_of_week.nil?
    return if frequency == "monthly" && day_of_month.nil?

    self.next_run_at = NextRunCalculator.call(frequency, day_of_week, day_of_month)
  end

  def advance_next_run_at!
    update!(
      last_run_at: Time.current,
      next_run_at: NextRunCalculator.call(frequency, day_of_week, day_of_month, after: Time.current)
    )
  end
end

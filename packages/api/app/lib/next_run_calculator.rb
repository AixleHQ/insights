# frozen_string_literal: true

# Calculates the next delivery time for a ScheduledExport based on frequency.
#
# Usage:
#   NextRunCalculator.call("daily",   nil, nil)            # → tomorrow at the current hour
#   NextRunCalculator.call("weekly",  1,   nil)            # → next Monday
#   NextRunCalculator.call("monthly", nil, 15)             # → the 15th of next/current month
#   NextRunCalculator.call("daily",   nil, nil, after: t)  # → advance from a given time
module NextRunCalculator
  def self.call(frequency, day_of_week, day_of_month, after: Time.current)
    case frequency
    when "daily"   then next_daily(after)
    when "weekly"  then next_weekday(day_of_week.to_i, after)
    when "monthly" then next_month_day(day_of_month.to_i, after)
    else
      raise ArgumentError, "Unknown frequency: #{frequency}"
    end
  end

  def self.next_daily(after)
    (after + 1.day).beginning_of_hour
  end

  def self.next_weekday(target_wday, after)
    days_ahead = (target_wday - after.wday) % 7
    days_ahead = 7 if days_ahead.zero?
    (after + days_ahead.days).beginning_of_day
  end

  def self.next_month_day(target_day, after)
    candidate = after.change(day: target_day)
    candidate = candidate.next_month if candidate <= after
    candidate.beginning_of_day
  rescue Date::Error
    # Clamp to last day of month when target_day exceeds month length
    last_day = Date.new(after.year, after.month, -1).day
    candidate = after.change(day: [ target_day, last_day ].min)
    candidate = candidate.next_month if candidate <= after
    candidate.beginning_of_day
  end

  private_class_method :next_daily, :next_weekday, :next_month_day
end

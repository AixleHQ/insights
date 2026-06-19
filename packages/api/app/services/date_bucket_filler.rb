# Builds a zero-filled array of ISO-8601 date strings for a date range,
# then merges in an existing data_map so every bucket has at least a default entry.
#
# Usage:
#   buckets = DateBucketFiller.fill(
#     start:       time_range_start,
#     finish:      time_range_end,
#     granularity: "month",   # or "day"
#     data_map:    date_map   # Hash keyed by iso8601 string
#   )
module DateBucketFiller
  # Returns an Array of Hashes: one entry per bucket, defaulting to { date: d }.
  def self.fill(start:, finish:, granularity:, data_map:)
    all_buckets(start: start, finish: finish, granularity: granularity).map do |d|
      data_map[d] || { date: d }
    end
  end

  # Returns a flat Array of ISO-8601 strings covering the range.
  def self.all_buckets(start:, finish:, granularity:)
    if granularity == "month"
      start_month = start.to_date.beginning_of_month
      end_month   = finish.to_date.beginning_of_month
      months = []
      m = start_month
      while m <= end_month
        months << m.iso8601
        m = m.next_month
      end
      months
    else
      (start.to_date..finish.to_date).map(&:iso8601)
    end
  end
end
